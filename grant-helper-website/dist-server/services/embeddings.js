import { RAG_EMBEDDING_MODEL, RAG_EMBEDDINGS_DISABLED, RAG_EMBEDDING_BATCH_SIZE } from '../config.js';
let embeddingExtractorPromise = null;
function rowsFromEmbeddingTensor(tensor) {
    const dims = tensor.dims;
    const nested = tensor.tolist();
    if (dims.length === 1) {
        const row = nested;
        return [row.map((x) => Number(x))];
    }
    if (dims.length === 2) {
        const outer = nested;
        return outer.map((row) => Array.isArray(row) ? row.map((x) => Number(x)) : [Number(row)]);
    }
    return [];
}
export function parseEmbeddingColumn(raw) {
    if (raw == null)
        return null;
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'number')) {
        return raw;
    }
    if (typeof raw === 'string') {
        try {
            const s = raw.trim();
            const parsed = JSON.parse(s.startsWith('[') ? s : `[${s}]`);
            if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'number')) {
                return parsed;
            }
        }
        catch {
            return null;
        }
    }
    return null;
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length || !a.length)
        return 0;
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
async function loadEmbeddingExtractor() {
    if (embeddingExtractorPromise)
        return embeddingExtractorPromise;
    embeddingExtractorPromise = (async () => {
        const { pipeline } = await import('@huggingface/transformers');
        console.info(`RAG: loading embedding model "${RAG_EMBEDDING_MODEL}"…`);
        return pipeline('feature-extraction', RAG_EMBEDDING_MODEL);
    })().catch((err) => {
        embeddingExtractorPromise = null;
        throw err;
    });
    return embeddingExtractorPromise;
}
/** Mean-pooled, L2-normalized embeddings via Hugging Face Transformers.js (ONNX). Returns null if disabled or model load fails. */
export async function embedTextsWithTransformers(texts) {
    if (RAG_EMBEDDINGS_DISABLED)
        return null;
    if (!texts.length)
        return [];
    try {
        const extractor = await loadEmbeddingExtractor();
        const result = texts.map(() => []);
        for (let start = 0; start < texts.length; start += RAG_EMBEDDING_BATCH_SIZE) {
            const end = Math.min(start + RAG_EMBEDDING_BATCH_SIZE, texts.length);
            const batchIdx = [];
            const batchStr = [];
            for (let i = start; i < end; i++) {
                const t = texts[i]?.trim() ?? '';
                if (t) {
                    batchIdx.push(i);
                    batchStr.push(t);
                }
            }
            if (!batchStr.length)
                continue;
            const tensor = await extractor(batchStr, { pooling: 'mean', normalize: true });
            const rows = rowsFromEmbeddingTensor(tensor);
            if (rows.length !== batchStr.length) {
                console.warn(`RAG: embedding batch shape mismatch (got ${rows.length} rows, expected ${batchStr.length})`);
                return null;
            }
            for (let j = 0; j < batchIdx.length; j++) {
                result[batchIdx[j]] = rows[j] ?? [];
            }
        }
        return result;
    }
    catch (e) {
        console.warn('embedTextsWithTransformers:', e);
        return null;
    }
}
