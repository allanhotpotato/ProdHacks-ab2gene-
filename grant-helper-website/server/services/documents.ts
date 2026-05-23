import mammoth from 'mammoth';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  hasValidSupabaseUrl,
  supabaseAdmin,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from '../config.js';

export function createUserSupabaseClient(accessToken: string): SupabaseClient | null {
  if (!hasValidSupabaseUrl || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Fetch combined text from document_chunks for a user (Supabase). Returns empty string if not configured or no data. */
export async function fetchUserDocumentContext(userId: string): Promise<string> {
  if (!supabaseAdmin || !userId?.trim()) return '';
  const { data, error } = await supabaseAdmin
    .from('document_chunks')
    .select('content, document_id, chunk_index')
    .eq('user_id', userId)
    .order('document_id', { ascending: true })
    .order('chunk_index', { ascending: true });
  if (error) {
    console.warn('Supabase document_chunks fetch failed:', error.message);
    return '';
  }
  if (!data?.length) return '';
  return data.map((r) => r.content).filter(Boolean).join('\n\n');
}

/** Sliding-window text chunks for embedding + RAG. */
export function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= chunkSize) return [t];
  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    const slice = t.slice(i, i + chunkSize);
    const trimmed = slice.trim();
    if (trimmed) chunks.push(trimmed);
    if (i + chunkSize >= t.length) break;
    i += chunkSize - overlap;
  }
  return chunks;
}

export async function persistChunksAndEmbeddings(
  userClient: SupabaseClient,
  userId: string,
  documentId: string,
  filename: string,
  chunks: string[],
  embeddings: number[][] | null
): Promise<void> {
  const batchSize = 50;
  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const slice = chunks.slice(offset, offset + batchSize);
    const rows = slice.map((content, j) => {
      const chunk_index = offset + j;
      const row: {
        user_id: string;
        document_id: string;
        chunk_index: number;
        content: string;
        source_info: Record<string, unknown>;
        embedding?: number[];
      } = {
        user_id: userId,
        document_id: documentId,
        chunk_index,
        content,
        source_info: { filename, source: 'extract-documents' },
      };
      if (embeddings?.[chunk_index]?.length) {
        row.embedding = embeddings[chunk_index];
      }
      return row;
    });

    const { error: insErr } = await userClient.from('document_chunks').insert(rows);
    if (insErr) throw new Error(`document_chunks insert failed: ${insErr.message}`);
  }

  const { error: upErr } = await userClient
    .from('documents')
    .update({ status: 'ready' })
    .eq('id', documentId)
    .eq('user_id', userId);
  if (upErr) throw new Error(`documents status update failed: ${upErr.message}`);
}

/** Extract text from PDF using unpdf (works in Node.js and serverless without DOM). */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import('unpdf');
  const result = await extractText(new Uint8Array(buffer));
  const text = result.text;
  return Array.isArray(text) ? text.join('\n\n') : (text ?? '');
}

export async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8');
  }
  if (mimeType === 'application/pdf') {
    return await extractTextFromPdf(buffer);
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }
  return `[Unsupported type ${mimeType} for ${filename}]`;
}
