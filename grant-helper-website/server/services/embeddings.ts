import {
  EMBEDDING_SERVICE_TIMEOUT_MS,
  EMBEDDING_SERVICE_URL,
  RAG_EMBEDDINGS_DISABLED,
} from '../config.js';

interface EmbedApiResponse {
  embeddings: number[][];
  model: string;
}

async function postEmbed(texts: string[]): Promise<number[][]> {
  const url = `${EMBEDDING_SERVICE_URL.replace(/\/$/, '')}/embed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(EMBEDDING_SERVICE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embedding service ${res.status}: ${body || res.statusText}`);
  }

  const data = (await res.json()) as EmbedApiResponse;
  if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
    throw new Error(
      `Embedding service returned ${data.embeddings?.length ?? 0} vectors for ${texts.length} texts`
    );
  }
  return data.embeddings;
}

/**
 * Embed texts via the Python sentence-transformers service (MiniLM L6 v2, 384-d).
 * Returns null if disabled, on service failure, or when the service is unreachable.
 * Empty/whitespace inputs get [] at the same index (no API call for those slots).
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (RAG_EMBEDDINGS_DISABLED) return null;
  if (!texts.length) return [];

  const result: number[][] = texts.map(() => []);
  const batch: { index: number; text: string }[] = [];

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]?.trim() ?? '';
    if (t) batch.push({ index: i, text: t });
  }

  if (!batch.length) return result;

  try {
    const vectors = await postEmbed(batch.map((b) => b.text));
    for (let j = 0; j < batch.length; j++) {
      result[batch[j].index] = vectors[j] ?? [];
    }
    return result;
  } catch (e) {
    console.warn(
      'embedTexts: Python embedding service failed. Is it running?',
      EMBEDDING_SERVICE_URL,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

// export const embedTextsWithTransformers = embedTexts;

/** Ping GET /health — useful for startup diagnostics */
export async function checkEmbeddingServiceHealth(): Promise<boolean> {
  try {
    const url = `${EMBEDDING_SERVICE_URL.replace(/\/$/, '')}/health`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}
