import { Router, Request, Response } from 'express';
import type { SmartMatchRequestBody } from '../types.js';
import { loadCatalog, normalizeCatalogGrant } from '../services/catalog.js';
import {
  generateApplicationTips,
  quickEligibilityCheck,
  scoreGrantMatch,
} from '../services/grantMatching.js';
import { extractOrganizationProfile } from '../services/profile.js';

const router = Router();

/** POST /api/grants/smart-match */
router.post('/smart-match', async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationProfile, grants, topN = 10 } = req.body as SmartMatchRequestBody;

    if (!organizationProfile || typeof organizationProfile !== 'string') {
      res.status(400).json({ error: 'organizationProfile is required and must be a string' });
      return;
    }
    if (!Array.isArray(grants) || grants.length === 0) {
      res.status(400).json({ error: 'grants must be a non-empty array' });
      return;
    }

    const orgProfile = await extractOrganizationProfile(organizationProfile);

    const eligibleGrants: Array<{ grant: Record<string, unknown>; index: number }> = [];
    const ineligibleGrants: Array<
      Record<string, unknown> & { matchScore: number; matchExplanation: string }
    > = [];

    for (let i = 0; i < grants.length; i++) {
      const grant = grants[i];
      try {
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 25000));
        }

        const { eligible, reason } = await quickEligibilityCheck(
          orgProfile,
          grant as Record<string, unknown>
        );

        if (eligible) {
          eligibleGrants.push({ grant: grant as Record<string, unknown>, index: i });
        } else {
          ineligibleGrants.push({
            ...(grant as Record<string, unknown>),
            matchScore: 10,
            matchExplanation: reason || 'Does not meet basic eligibility requirements.',
          });
        }
      } catch (err) {
        console.error(`Failed to check eligibility for grant ${i}:`, err);
        eligibleGrants.push({ grant: grant as Record<string, unknown>, index: i });
      }
    }

    const scoredGrants: Array<
      Record<string, unknown> & { matchScore: number; matchExplanation: string }
    > = [];
    for (const { grant, index } of eligibleGrants) {
      try {
        if (scoredGrants.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 25000));
        }

        const { score, explanation } = await scoreGrantMatch(orgProfile, grant);
        scoredGrants.push({
          ...grant,
          matchScore: score,
          matchExplanation: explanation,
        });
      } catch (err) {
        console.error(`Failed to score grant ${index}:`, err);
        scoredGrants.push({
          ...grant,
          matchScore: 0,
          matchExplanation: 'Failed to score this grant due to an error.',
        });
      }
    }

    const allGrants = [...scoredGrants, ...ineligibleGrants];

    const topMatches = allGrants.sort((a, b) => b.matchScore - a.matchScore).slice(0, topN);

    const matchesWithTips = await Promise.all(
      topMatches.map(async (match, index) => {
        if (index < 3 && match.matchScore >= 60) {
          try {
            const tips = await generateApplicationTips(orgProfile, match, match.matchScore);
            return { ...match, applicationTips: tips };
          } catch (err) {
            console.error(`Failed to generate tips for grant ${index}:`, err);
            return match;
          }
        }
        return match;
      })
    );

    res.json({
      organizationProfile: orgProfile,
      matches: matchesWithTips,
      totalScored: grants.length,
      eligibleCount: eligibleGrants.length,
      ineligibleCount: ineligibleGrants.length,
    });
  } catch (err) {
    console.error('Smart match error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to match grants',
    });
  }
});

/** GET /api/grants/catalog */
router.get('/catalog', (req: Request, res: Response): void => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.toLowerCase().trim() : '';
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    let grants = loadCatalog();

    if (q) {
      grants = grants.filter((g) => {
        const searchable = [
          g.opportunity_title,
          g.provider,
          g.description,
          g.category,
          ...(g.focus_areas ?? []),
          g.target_population,
          g.notes,
        ]
          .join(' ')
          .toLowerCase();
        return q.split(' ').every((term) => searchable.includes(term));
      });
    }

    if (category) {
      grants = grants.filter((g) => g.category.toLowerCase().includes(category));
    }

    const normalized = grants.slice(0, limit).map(normalizeCatalogGrant);
    res.json({ data: normalized, total: normalized.length, source: 'catalog' });
  } catch (err) {
    console.error('Catalog error:', err);
    res.status(500).json({ error: 'Failed to load catalog' });
  }
});

export default router;
