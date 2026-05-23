import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../config.js';
import type { AutofillFieldRequestBody } from '../types.js';
import { generateAutofillAnswer } from '../services/autofill.js';
import { fetchUserDocumentContext } from '../services/documents.js';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      questionText,
      fieldKey = '',
      descriptor = '',
      tagName = '',
      inputType = '',
      pageTitle = '',
      pageUrl = '',
      organizationProfile = '',
      grantContext = '',
      userId = '',
    } = req.body as AutofillFieldRequestBody;

    if (!questionText || typeof questionText !== 'string' || !questionText.trim()) {
      res.status(400).json({ error: 'questionText is required and must be a string' });
      return;
    }

    let organizationContext = typeof organizationProfile === 'string' ? organizationProfile.trim() : '';
    if (typeof userId === 'string' && userId.trim() && supabaseAdmin) {
      const docContext = await fetchUserDocumentContext(userId.trim());
      if (docContext) {
        organizationContext = organizationContext
          ? `${organizationContext}\n\n--- Documents from Supabase ---\n\n${docContext}`
          : docContext;
      }
    }

    if (!organizationContext) {
      res.status(400).json({ error: 'organizationProfile or user document context is required' });
      return;
    }

    const result = await generateAutofillAnswer({
      organizationContext,
      grantContext: typeof grantContext === 'string' ? grantContext.trim() : '',
      questionText: questionText.trim(),
      fieldKey: typeof fieldKey === 'string' ? fieldKey.trim() : '',
      descriptor: typeof descriptor === 'string' ? descriptor.trim() : '',
      tagName: typeof tagName === 'string' ? tagName.trim() : '',
      inputType: typeof inputType === 'string' ? inputType.trim() : '',
      pageTitle: typeof pageTitle === 'string' ? pageTitle.trim() : '',
      pageUrl: typeof pageUrl === 'string' ? pageUrl.trim() : '',
    });

    res.json(result);
  } catch (err) {
    console.error('Autofill field error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate autofill answer',
    });
  }
});

export default router;
