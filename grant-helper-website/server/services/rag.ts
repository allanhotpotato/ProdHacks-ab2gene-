import { embedTexts } from './embeddings.js';
import { createUserSupabaseClient } from './documents.js';

export function parseEmbeddingColumn(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'number')) {
    return raw as number[];
  }
  if (typeof raw === 'string') {
    try {
      const s = raw.trim();
      const parsed = JSON.parse(s.startsWith('[') ? s : `[${s}]`) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number')) {
        return parsed as number[];
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * Embed the user question and return the top-K document chunks by cosine similarity.
 * Uses the user's JWT so RLS applies. Returns '' if no chunks/embeddings or no token.
 */
export async function retrieveRelevantChunksForQuery(accessToken: string, userQuery: string): Promise<string> {
  const q = userQuery.trim();
  if (!q) return '';

  const userClient = createUserSupabaseClient(accessToken);
  if (!userClient) return '';

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return '';

  const userId = authData.user.id;
  const { data: rows, error } = await userClient
    .from('document_chunks')
    .select('content, embedding, source_info')
    .eq('user_id', userId);

  if (error || !rows?.length) {
    if (error) console.warn('RAG chat: document_chunks select failed:', error.message);
    return '';
  }

  const withEmb: Array<{ content: string; embedding: number[]; source?: string }> = [];
  for (const r of rows) {
    const emb = parseEmbeddingColumn(r.embedding);
    const content = typeof r.content === 'string' ? r.content.trim() : '';
    if (!emb?.length || !content) continue;
    const fn = (r.source_info as { filename?: string } | null)?.filename;
    withEmb.push({ content, embedding: emb, source: fn });
  }

  if (!withEmb.length) return '';

  let queryEmbedding: number[] | undefined;
  try {
    const result = await embedTexts([q]);
    queryEmbedding = result?.[0];
  } catch (e) {
    console.warn('RAG chat: query embedding failed:', e);
  }
  if (!queryEmbedding) return '';

  const topK = Number(process.env.RAG_CHAT_TOP_K) || 8;
  const maxChars = Number(process.env.RAG_CHAT_MAX_CHUNK_CHARS) || 12000;

  const scored = withEmb
    .map((row) => ({ ...row, score: cosineSimilarity(queryEmbedding!, row.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const blocks: string[] = [];
  for (const row of scored) {
    const block = row.source ? `[${row.source}]\n${row.content}` : row.content;
    if (block.trim()) blocks.push(block.trim());
  }

  let joined = blocks.join('\n\n---\n\n');
  if (joined.length > maxChars) {
    joined = `${joined.slice(0, maxChars)}…`;
  }
  return joined;
}
