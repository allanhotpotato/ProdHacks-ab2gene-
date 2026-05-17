import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

/** Default: ONNX MiniLM (384-d). Override with RAG_EMBEDDING_MODEL. First run downloads model weights. */
export const RAG_EMBEDDING_MODEL =
  process.env.RAG_EMBEDDING_MODEL?.trim() || 'onnx-community/all-MiniLM-L6-v2-ONNX';
/** Set RAG_EMBEDDINGS_DISABLED=1 on tiny serverless bundles (e.g. strict size limits); chunk text + insert still works without vectors. */
export const RAG_EMBEDDINGS_DISABLED =
  process.env.RAG_EMBEDDINGS_DISABLED === '1' || /^true$/i.test(process.env.RAG_EMBEDDINGS_DISABLED ?? '');

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

export const hasValidSupabaseUrl = (() => {
  try {
    return !!SUPABASE_URL && /^https?:\/\//i.test(SUPABASE_URL) && Boolean(new URL(SUPABASE_URL));
  } catch {
    return false;
  }
})();

export let supabaseAdmin: SupabaseClient | null = null;
if (hasValidSupabaseUrl && SUPABASE_ANON_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI API key.');
  process.exit(1);
}
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export const RAG_SYSTEM_INSTRUCTION = `You are the founder or program director of the organization applying for this grant.
You are personally completing this grant application. All information provided represents your organization's real operations, programs, impact, and plans.
Answer each question in a natural, professional tone as a human applicant would. Write in first person plural ("we") when referring to the organization.

Never mention context, documents, files, sources, or any external materials. Do not imply that you are referencing anything. The information is part of your own knowledge and experience as the organization.

Do not use phrases such as:
- 'based on the provided information'
- 'according to the document [file_name]'
- 'from the context'
- 'the materials state'
- ([file_name].pdf, [file_name].txt, etc.)
- or anything similar

Do not include disclaimers, uncertainty statements, or references to missing information.

If specific details are not explicitly available, provide a reasonable, truthful, and professional response consistent with the organization's mission, scale, and activities. Do not fabricate precise metrics, dates, or financial figures unless they are explicitly provided.

Use clear, natural paragraphs only. Do not use bullet points or numbered lists.
Keep the tone confident, professional, and human.
`;

export const CHUNK_CHAR_SIZE = Number(process.env.RAG_CHUNK_CHAR_SIZE) || 1500;
export const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 200;

export const RAG_EMBEDDING_BATCH_SIZE = Math.max(
  1,
  Math.min(32, Number(process.env.RAG_EMBEDDING_BATCH_SIZE) || 8)
);
