import type { FeatureExtractionPipeline, Tensor } from '@huggingface/transformers';
import { RAG_EMBEDDING_BATCH_SIZE, RAG_EMBEDDING_MODEL, RAG_EMBEDDINGS_DISABLED } from '../config.js';

let embeddingExtractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function rowsFromEmbeddingTensor(tensor: Tensor): number[][] {
  const dims = tensor.dims;
  const nested = tensor.tolist() as unknown;
  if (dims.length === 1) {
    const row = nested as number[];
    return [row.map((x) => Number(x))];
  }
  if (dims.length === 2) {
    const outer = nested as unknown[];
    return outer.map((row) =>
      Array.isArray(row) ? row.map((x) => Number(x)) : [Number(row)]
    );
  }
  return [];
}

async function loadEmbeddingExtractor(): Promise<FeatureExtractionPipeline> {
  if (embeddingExtractorPromise) return embeddingExtractorPromise;
  embeddingExtractorPromise = (async () => {
    const { pipeline } = await import('@huggingface/transformers');
    console.info(`RAG: loading embedding model "${RAG_EMBEDDING_MODEL}"…`);
    return pipeline('feature-extraction', RAG_EMBEDDING_MODEL) as Promise<FeatureExtractionPipeline>;
  })().catch((err) => {
    embeddingExtractorPromise = null;
    throw err;
  });
  return embeddingExtractorPromise;
}

/** Mean-pooled, L2-normalized embeddings via Hugging Face Transformers.js (ONNX). Returns null if disabled or model load fails. */
export async function embedTextsWithTransformers(texts: string[]): Promise<number[][] | null> {
  if (RAG_EMBEDDINGS_DISABLED) return null;
  if (!texts.length) return [];

  try {
    const extractor = await loadEmbeddingExtractor();
    const result: number[][] = texts.map(() => []);

    for (let start = 0; start < texts.length; start += RAG_EMBEDDING_BATCH_SIZE) {
      const end = Math.min(start + RAG_EMBEDDING_BATCH_SIZE, texts.length);
      const batchIdx: number[] = [];
      const batchStr: string[] = [];
      for (let i = start; i < end; i++) {
        const t = texts[i]?.trim() ?? '';
        if (t) {
          batchIdx.push(i);
          batchStr.push(t);
        }
      }
      if (!batchStr.length) continue;

      const tensor = await extractor(batchStr, { pooling: 'mean', normalize: true });
      const rows = rowsFromEmbeddingTensor(tensor);
      if (rows.length !== batchStr.length) {
        console.warn(
          `RAG: embedding batch shape mismatch (got ${rows.length} rows, expected ${batchStr.length})`
        );
        return null;
      }
      for (let j = 0; j < batchIdx.length; j++) {
        result[batchIdx[j]] = rows[j] ?? [];
      }
    }

    return result;
  } catch (e) {
    console.warn('embedTextsWithTransformers:', e);
    return null;
  }
}
