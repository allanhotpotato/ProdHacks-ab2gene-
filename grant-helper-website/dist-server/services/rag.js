import { createClient } from '@supabase/supabase-js';
import { CHUNK_CHAR_SIZE, CHUNK_OVERLAP, hasValidSupabaseUrl, supabaseAdmin, SUPABASE_ANON_KEY, SUPABASE_URL, } from '../config.js';
import { cosineSimilarity, embedTextsWithTransformers, parseEmbeddingColumn } from './embeddings.js';
export function createUserSupabaseClient(accessToken) {
    if (!hasValidSupabaseUrl || !SUPABASE_ANON_KEY)
        return null;
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}
/**
 * Embed the user question and return the top-K document chunks by cosine similarity.
 * Uses the user's JWT so RLS applies. Returns '' if no chunks/embeddings or no token.
 */
export async function retrieveRelevantChunksForQuery(accessToken, userQuery) {
    const q = userQuery.trim();
    if (!q)
        return '';
    const userClient = createUserSupabaseClient(accessToken);
    if (!userClient)
        return '';
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user)
        return '';
    const userId = authData.user.id;
    const { data: rows, error } = await userClient
        .from('document_chunks')
        .select('content, embedding, source_info')
        .eq('user_id', userId);
    if (error || !rows?.length) {
        if (error)
            console.warn('RAG chat: document_chunks select failed:', error.message);
        return '';
    }
    const withEmb = [];
    for (const r of rows) {
        const emb = parseEmbeddingColumn(r.embedding);
        const content = typeof r.content === 'string' ? r.content.trim() : '';
        if (!emb?.length || !content)
            continue;
        const fn = r.source_info?.filename;
        withEmb.push({ content, embedding: emb, source: fn });
    }
    if (!withEmb.length)
        return '';
    let queryEmbedding;
    try {
        const result = await embedTextsWithTransformers([q]);
        queryEmbedding = result?.[0];
    }
    catch (e) {
        console.warn('RAG chat: query embedding failed:', e);
    }
    if (!queryEmbedding)
        return '';
    const topK = Number(process.env.RAG_CHAT_TOP_K) || 8;
    const maxChars = Number(process.env.RAG_CHAT_MAX_CHUNK_CHARS) || 12000;
    const scored = withEmb
        .map((row) => ({ ...row, score: cosineSimilarity(queryEmbedding, row.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    const blocks = [];
    for (const row of scored) {
        const block = row.source ? `[${row.source}]\n${row.content}` : row.content;
        if (block.trim())
            blocks.push(block.trim());
    }
    let joined = blocks.join('\n\n---\n\n');
    if (joined.length > maxChars) {
        joined = `${joined.slice(0, maxChars)}…`;
    }
    return joined;
}
/** Fetch combined text from document_chunks for a user (Supabase). Returns empty string if not configured or no data. */
export async function fetchUserDocumentContext(userId) {
    if (!supabaseAdmin || !userId?.trim())
        return '';
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
    if (!data?.length)
        return '';
    return data.map((r) => r.content).filter(Boolean).join('\n\n');
}
/** Sliding-window text chunks for embedding + RAG. */
export function splitTextIntoChunks(text, chunkSize, overlap) {
    const t = text.trim();
    if (!t)
        return [];
    if (t.length <= chunkSize)
        return [t];
    const chunks = [];
    let i = 0;
    while (i < t.length) {
        const slice = t.slice(i, i + chunkSize);
        const trimmed = slice.trim();
        if (trimmed)
            chunks.push(trimmed);
        if (i + chunkSize >= t.length)
            break;
        i += chunkSize - overlap;
    }
    return chunks;
}
export async function persistChunksAndEmbeddings(userClient, userId, documentId, filename, chunks, embeddings) {
    // const { error: delErr } = await userClient.from('document_chunks').delete().eq('document_id', documentId);
    // if (delErr) throw new Error(`Failed to clear old chunks: ${delErr.message}`);
    const batchSize = 50;
    for (let offset = 0; offset < chunks.length; offset += batchSize) {
        const slice = chunks.slice(offset, offset + batchSize);
        const rows = slice.map((content, j) => {
            const chunk_index = offset + j;
            const row = {
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
        if (insErr)
            throw new Error(`document_chunks insert failed: ${insErr.message}`);
    }
    const { error: upErr } = await userClient
        .from('documents')
        .update({ status: 'ready' })
        .eq('id', documentId)
        .eq('user_id', userId);
    if (upErr)
        throw new Error(`documents status update failed: ${upErr.message}`);
}
export { CHUNK_CHAR_SIZE, CHUNK_OVERLAP };
