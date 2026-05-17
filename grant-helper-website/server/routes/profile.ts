import { Router, Request, Response } from 'express';
import type { ExtractProfileBody } from '../types.js';
import { extractOrganizationProfile } from '../services/profile.js';

const router = Router();

/** POST /api/profile/extract */
router.post('/extract', async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body as ExtractProfileBody;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required and must be a string' });
      return;
    }

    const profile = await extractOrganizationProfile(text);
    res.json({ profile });
  } catch (err) {
    console.error('Profile extraction error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to extract profile',
    });
  }
});

export default router;
