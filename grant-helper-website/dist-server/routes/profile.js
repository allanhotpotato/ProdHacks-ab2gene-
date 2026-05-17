import { Router } from 'express';
import { extractOrganizationProfile } from '../services/profile.js';
const router = Router();
/** POST /api/profile/extract
 * Body: { text: string }
 * Extracts structured organization metadata from document text
 * Returns: { profile: OrganizationProfile }
 */
router.post('/extract', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            res.status(400).json({ error: 'text is required and must be a string' });
            return;
        }
        const profile = await extractOrganizationProfile(text);
        res.json({ profile });
    }
    catch (err) {
        console.error('Profile extraction error:', err);
        res.status(500).json({
            error: err instanceof Error ? err.message : 'Failed to extract profile',
        });
    }
});
export default router;
