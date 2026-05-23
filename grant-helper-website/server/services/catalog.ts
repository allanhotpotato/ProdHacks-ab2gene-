import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { CatalogGrant } from '../types.js';

export type { CatalogGrant };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _catalogGrants: CatalogGrant[] | null = null;

export function loadCatalog(): CatalogGrant[] {
  if (_catalogGrants) return _catalogGrants;
  try {
    const seedPath = path.resolve(__dirname, '..', '..', 'src', 'data', 'grants-seed.json');
    const raw = readFileSync(seedPath, 'utf8');
    const parsed = JSON.parse(raw) as { grants?: CatalogGrant[] };
    _catalogGrants = parsed.grants ?? [];
    console.log(`Loaded ${_catalogGrants.length} grants from catalog`);
    return _catalogGrants;
  } catch (err) {
    console.warn('Could not load grants catalog:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function normalizeCatalogGrant(g: CatalogGrant): Record<string, unknown> {
  return {
    opportunity_id: `catalog-${g.id}`,
    opportunity_title: g.opportunity_title,
    opportunity_number: null,
    agency_name: g.provider,
    source: 'catalog',
    category: g.category,
    geographic_scope: g.geographic_scope,
    states_eligible: g.states_eligible,
    eligibility_types: g.eligibility_types,
    focus_areas: g.focus_areas,
    target_population: g.target_population,
    application_url: g.application_url,
    is_recurring: g.is_recurring,
    deadline_type: g.deadline_type,
    typical_deadline_month: g.typical_deadline_month,
    notes: g.notes,
    summary: {
      summary_description: g.description,
      award_floor: g.funding_min,
      award_ceiling: g.funding_max,
      close_date: null,
      post_date: null,
    },
  };
}
