import { Router, Request, Response } from 'express';
import type { ChatMessage, ChatRequestBody } from '../types.js';
import { buildSystemInstruction, generateModelText } from '../services/llm.js';
import { retrieveRelevantChunksForQuery } from '../services/rag.js';

const router = Router();

/** POST /api/chat
 * Body: { grantContext: string, profileContext?: string, messages: ChatMessage[], accessToken?: string }
 * When accessToken is the user's Supabase JWT, document knowledge comes from embedding retrieval over document_chunks (not the full profile text).
 * Returns: { reply: string }
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { grantContext, messages, accessToken: bodyToken } = req.body as ChatRequestBody;
    if (!grantContext || typeof grantContext !== 'string') {
      res.status(400).json({ error: 'grantContext is required and must be a string' });
      return;
    }
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'messages must be an array' });
      return;
    }
    const authHeader = req.headers.authorization;
    const tokenFromHeader =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';
    const tokenFromBody = typeof bodyToken === 'string' ? bodyToken.trim() : '';
    const accessToken = tokenFromHeader || tokenFromBody;

    const valid = (messages as ChatMessage[]).filter((m) => m.role && m.content);
    const lastMessage = valid[valid.length - 1];
    const toSend =
      lastMessage?.role === 'user'
        ? lastMessage.content
        : 'Say you are ready to answer questions about this grant.';
    const priorHistory = valid.slice(0, -1).map((m) => ({
      role: (m.role === 'model' ? 'model' : 'user') as 'user' | 'model',
      content: m.content,
    }));

    let retrievedChunks = '';

    if (accessToken) {
      try {
        retrievedChunks = await retrieveRelevantChunksForQuery(accessToken, toSend);
      } catch (ragErr) {
        console.warn('RAG chat: retrieveRelevantChunksForQuery failed:', ragErr);
      }
    }

    const text = await generateModelText(
      buildSystemInstruction(grantContext, retrievedChunks || undefined),
      toSend,
      priorHistory
    );

    res.json({ reply: text ?? '' });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message =
      status === 429
        ? 'Rate limit exceeded. Please wait a minute and try again, or check your OpenAI API quota.'
        : err instanceof Error
          ? err.message
          : 'Failed to get reply from assistant';
    console.error('Chat error:', err);
    res.status(status === 429 ? 429 : 500).json({ error: message });
  }
});

export default router;
