import { Router } from 'express';
import { supabaseAdmin } from '../config.js';
import { generateAnswerForQuestion } from '../services/llm.js';
import { fetchUserDocumentContext } from '../services/rag.js';
const router = Router();
function normalizeEntryKey(entryId) {
    const t = entryId.trim();
    return t.startsWith('entry.') ? t : `entry.${t}`;
}
/** POST /api/google-form/prefill
 * Body: { formId, organizationProfile?, entryIds, questions?, userId? }
 * - entryIds: maps field names to Google Form entry IDs (e.g. "impact" -> "entry.216607139" or "216607139").
 * - questions: optional Record<fieldName, questionText>. If provided, answers are generated with OpenAI using
 *   context = organizationProfile + (if userId) document_chunks from Supabase; then URLSearchParams are filled.
 * - userId: optional; when set and Supabase is configured, document_chunks for this user are used as context.
 * Returns: { url: string, answers?: Record<string, string> } — pre-fill URL and optionally the generated answers.
 */
router.post('/prefill', async (req, res) => {
    try {
        const { formId, organizationProfile = '', entryIds = {}, questions = {}, userId } = req.body;
        if (!formId || typeof formId !== 'string') {
            res.status(400).json({ error: 'formId is required and must be a string' });
            return;
        }
        let context = organizationProfile.trim();
        if (userId?.trim() && supabaseAdmin) {
            const docContext = await fetchUserDocumentContext(userId);
            if (docContext)
                context = (context ? context + '\n\n--- Documents from Supabase ---\n\n' : '') + docContext;
        }
        if (!context && Object.keys(questions).length > 0) {
            res.status(400).json({ error: 'Provide organizationProfile or a userId with documents in Supabase to generate answers.' });
            return;
        }
        const answers = {};
        if (Object.keys(questions).length > 0 && context) {
            for (const [field, questionText] of Object.entries(questions)) {
                if (!questionText?.trim())
                    continue;
                const wordMatch = questionText.match(/Max\s+(\d+)\s+words/i);
                const wordLimit = wordMatch ? parseInt(wordMatch[1], 10) : undefined;
                const answer = await generateAnswerForQuestion(context, questionText, wordLimit);
                answers[field] = answer;
            }
        }
        const base = `https://docs.google.com/forms/d/e/${formId.trim()}/viewform`;
        const params = new URLSearchParams();
        params.set('usp', 'pp_url');
        for (const [field, entryId] of Object.entries(entryIds)) {
            if (!entryId?.trim())
                continue;
            const key = normalizeEntryKey(entryId);
            const value = answers[field] ?? (typeof req.body[field] === 'string' ? req.body[field] : field === 'profile' ? organizationProfile : '');
            if (value)
                params.set(key, value);
        }
        const url = `${base}?${params.toString()}`;
        res.json({ url, ...(Object.keys(answers).length > 0 ? { answers } : {}) });
    }
    catch (err) {
        console.error('Google Form prefill error:', err);
        res.status(500).json({
            error: err instanceof Error ? err.message : 'Failed to build prefill URL',
        });
    }
});
/** GET /api/google-form/prefill-url
 * Query: formId, entryIds as JSON string or entry.XXX=value.
 * Redirects to the Google Form pre-fill URL (uses GET as requested).
 */
router.get('/prefill-url', (req, res) => {
    const formId = typeof req.query.formId === 'string' ? req.query.formId.trim() : '';
    const organizationProfile = typeof req.query.profile === 'string' ? req.query.profile : '';
    if (!formId) {
        res.status(400).send('formId query parameter is required');
        return;
    }
    const base = `https://docs.google.com/forms/d/e/${formId}/viewform`;
    const params = new URLSearchParams();
    params.set('usp', 'pp_url');
    const entryIdsJson = req.query.entryIds;
    if (typeof entryIdsJson === 'string') {
        try {
            const entryIds = JSON.parse(entryIdsJson);
            if (entryIds.profile && organizationProfile) {
                params.set(`entry.${entryIds.profile}`, organizationProfile);
            }
            for (const [key, entryId] of Object.entries(entryIds)) {
                if (key !== 'profile' && entryId && req.query[key] !== undefined) {
                    params.set(`entry.${entryId}`, String(req.query[key]));
                }
            }
        }
        catch {
            // ignore invalid JSON
        }
    }
    const url = `${base}?${params.toString()}`;
    res.redirect(302, url);
});
export default router;
