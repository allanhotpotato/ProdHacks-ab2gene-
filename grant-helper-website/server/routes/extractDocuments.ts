import { Router, Request, Response } from 'express';
import { upload } from '../middleware/upload.js';
import { CHUNK_CHAR_SIZE, CHUNK_OVERLAP } from '../config.js';
import { embedTextsWithTransformers } from '../services/embeddings.js';
import {
  createUserSupabaseClient,
  extractTextFromFile,
  persistChunksAndEmbeddings,
  splitTextIntoChunks,
} from '../services/documents.js';

const router = Router();

/** POST /api/extract-documents
 * Multipart form with "files" (array of files). Returns { text: string, chunksInserted?: number }.
 * Optional: field "documentIds" = JSON array of document UUIDs (same order as files), and
 * Authorization: Bearer <access_token> — required together to persist chunks + embeddings to Supabase.
 */
router.post('/', upload.array('files', 20), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) {
      res.status(400).json({ error: 'No files uploaded. Send multipart form with field "files".' });
      return;
    }

    let documentIds: string[] | undefined;
    const rawIds = req.body?.documentIds;
    if (typeof rawIds === 'string' && rawIds.trim()) {
      try {
        const parsed = JSON.parse(rawIds) as unknown;
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string' && x.length > 0)) {
          documentIds = parsed as string[];
        }
      } catch {
        /* ignore invalid JSON */
      }
    }

    const authHeader = req.headers.authorization;
    const accessToken =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    const parts: string[] = [];
    let chunksInserted = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);
      const trimmed = text.trim();
      if (trimmed) {
        parts.push(`--- ${file.originalname} ---\n${trimmed}`);
      }

      const docId = documentIds?.[i];
      const canPersist =
        Boolean(accessToken && docId && trimmed && documentIds?.length === files.length);

      if (!canPersist) {
        continue;
      }

      const userClient = createUserSupabaseClient(accessToken);
      if (!userClient) {
        continue;
      }

      const { data: authData, error: authErr } = await userClient.auth.getUser();
      if (authErr || !authData.user) {
        console.warn('extract-documents: invalid session for chunk persist:', authErr?.message);
        continue;
      }

      const userId = authData.user.id;

      try {
        const chunks = splitTextIntoChunks(trimmed, CHUNK_CHAR_SIZE, CHUNK_OVERLAP);
        if (!chunks.length) continue;

        const embeddings = await embedTextsWithTransformers(chunks);

        await persistChunksAndEmbeddings(userClient, userId, docId!, file.originalname, chunks, embeddings);
        chunksInserted += chunks.length;
      } catch (persistErr) {
        console.error('extract-documents: persist chunks failed:', persistErr);
        throw persistErr;
      }
    }

    res.json({ text: parts.join('\n\n'), chunksInserted });
  } catch (err) {
    console.error('Extract error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to extract text from documents',
    });
  }
});

export default router;
