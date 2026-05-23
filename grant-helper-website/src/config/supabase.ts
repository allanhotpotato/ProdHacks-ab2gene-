/**
 * Supabase Client Configuration (Production-Ready Stub)
 *
 * This file demonstrates how Supabase would be integrated for production.
 * Currently NOT used in the demo to keep local file upload working for Feb 20 deadline.
 *
 * To enable Supabase in production:
 * 1. Run migration: supabase/migrations/001_initial_schema.sql
 * 2. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env
 * 3. Create 'user-docs' storage bucket in Supabase Dashboard
 * 4. Configure Storage RLS policies (see migration file comments)
 * 5. Replace src/api/extractDocuments.ts with uploadToSupabase() calls
 */

import { createClient } from '@supabase/supabase-js';
import { extractDocuments } from '../api/extractDocuments';

// These would be set in production .env:
// VITE_SUPABASE_URL=https://your-project.supabase.co
// VITE_SUPABASE_ANON_KEY=your-anon-key

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.');
  }

  return supabase;
}

/**
 * Upload a file to Supabase Storage, then chunk + embed via the API server (Python)
 * and insert rows into `document_chunks`.
 */
export async function uploadToSupabase(file: File, userId: string): Promise<void> {
  const client = requireSupabase();
  const documentId = crypto.randomUUID();
  const storagePath = `${userId}/${documentId}/${file.name}`;

  const { error: uploadError } = await client.storage
    .from('user-docs')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { error: dbError } = await client.from('documents').insert({
    id: documentId,
    user_id: userId,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    storage_path: storagePath,
    file_size_bytes: file.size,
    status: 'processing',
  });

  if (dbError) throw dbError;

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (accessToken) {
    try {
      await extractDocuments([file], {
        accessToken,
        documentIds: [documentId],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chunking or embedding failed';
      await client
        .from('documents')
        .update({ status: 'failed', error: message })
        .eq('id', documentId)
        .eq('user_id', userId);
      throw err;
    }
  } else {
    console.warn(
      'uploadToSupabase: no auth session; file stored but document_chunks were not created'
    );
    await client
      .from('documents')
      .update({ status: 'uploaded' })
      .eq('id', documentId)
      .eq('user_id', userId);
  }
}

/**
 * Fetch user's documents from Supabase
 * @param userId - User ID (from auth.user())
 * @returns Array of document metadata
 */
export async function getUserDocuments(userId: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Search user's document chunks (RAG retrieval)
 * @param userId - User ID (from auth.user())
 * @param query - Search query
 * @param limit - Max results
 * @returns Relevant document chunks ranked by relevance
 */
export async function searchDocuments(
  userId: string,
  query: string,
  limit: number = 10
) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('search_user_documents', {
    p_user_id: userId,
    p_query: query,
    p_limit: limit,
  });

  if (error) throw error;
  return data;
}

/**
 * Delete a document and its chunks
 * @param documentId - Document UUID
 */
export async function deleteDocument(documentId: string) {
  const client = requireSupabase();
  // Get document metadata first
  const { data: doc, error: fetchError } = await client
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single();

  if (fetchError) throw fetchError;

  // Delete from storage
  const { error: storageError } = await client.storage
    .from('user-docs')
    .remove([doc.storage_path]);

  if (storageError) throw storageError;

  // Database cascades will auto-delete chunks due to ON DELETE CASCADE
  const { error: dbError } = await client
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (dbError) throw dbError;
}

export type OrganizationProfileRow = {
  full_name: string;
  organization_name: string;
};

export async function fetchOrganizationProfile(
  userId: string
): Promise<OrganizationProfileRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('full_name, organization_name')
    .eq('id', userId)
    .maybeSingle();
  
  if (error) throw error;
  return data;
}

/** Ensures a row exists (e.g. if signup predates the org-profile migration). */
export async function ensureOrganizationProfileRow(userId: string): Promise<void> {
  const client = requireSupabase();
  const { data: existing } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (existing) return;

  const { error } = await client.from('profiles').insert({
    id: userId,
    organization_name: 'My organization',
    organization_profile: '',
  });

  if (error && !/duplicate|unique/i.test(error.message)) throw error;
}

export async function saveOrganizationProfileText(userId: string, text: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('profiles')
    .update({ organization_profile: text })
    .eq('id', userId);

  if (error) throw error;
}
