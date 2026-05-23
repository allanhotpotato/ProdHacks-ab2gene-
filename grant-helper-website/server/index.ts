import './loadEnv.js';
import { EMBEDDING_SERVICE_URL, RAG_EMBEDDINGS_DISABLED } from './config.js';
import { checkEmbeddingServiceHealth } from './services/embeddings.js';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`Grant chat API listening on http://localhost:${PORT}`);
    if (!RAG_EMBEDDINGS_DISABLED) {
      const ok = await checkEmbeddingServiceHealth();
      if (ok) {
        console.log(`Embedding service OK at ${EMBEDDING_SERVICE_URL}`);
      } else {
        console.warn(
          `Embedding service not reachable at ${EMBEDDING_SERVICE_URL} — start it with: npm run dev:embed`
        );
      }
    }
  });
}

export default app;
