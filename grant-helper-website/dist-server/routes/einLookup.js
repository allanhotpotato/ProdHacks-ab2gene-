import { Router } from 'express';
const router = Router();
// IRS BMF lookup tables for decoding raw codes into human-readable descriptions
const NTEE_DESCRIPTIONS = {
    A: 'Arts, Culture & Humanities', B: 'Education', C: 'Environment',
    D: 'Animal-Related', E: 'Health Care', F: 'Mental Health & Crisis Intervention',
    G: 'Disease, Disorders & Medical Disciplines', H: 'Medical Research',
    I: 'Crime & Legal-Related', J: 'Employment', K: 'Food, Agriculture & Nutrition',
    L: 'Housing & Shelter', M: 'Public Safety, Disaster Preparedness & Relief',
    N: 'Recreation & Sports', O: 'Youth Development', P: 'Human Services',
    Q: 'International, Foreign Affairs & National Security', R: 'Civil Rights & Advocacy',
    S: 'Community Improvement & Capacity Building', T: 'Philanthropy & Voluntarism',
    U: 'Science & Technology', V: 'Social Science', W: 'Public & Societal Benefit',
    X: 'Religion-Related', Y: 'Mutual & Membership Benefit', Z: 'Unknown',
};
const SUBSECTION_DESCRIPTIONS = {
    '2': '501(c)(2) — Title Holding Corporation',
    '3': '501(c)(3) — Charitable, Educational, Religious, or Scientific',
    '4': '501(c)(4) — Social Welfare Organization',
    '5': '501(c)(5) — Labor, Agricultural & Horticultural',
    '6': '501(c)(6) — Business League / Trade Association',
    '7': '501(c)(7) — Social & Recreational Club',
    '8': '501(c)(8) — Fraternal Beneficiary Society',
    '9': '501(c)(9) — Voluntary Employee Benefit Association',
    '10': '501(c)(10) — Domestic Fraternal Society',
    '19': '501(c)(19) — Veterans Organization',
};
const FOUNDATION_DESCRIPTIONS = {
    '0': 'Not a Private Foundation',
    '2': 'Private Operating Foundation',
    '3': 'Private Foundation (General)',
    '4': 'Private Foundation (Exempt from Excise Tax)',
    '10': 'Church',
    '11': 'School',
    '12': 'Hospital or Medical Research Organization',
    '13': 'Organization Supporting Government',
    '14': 'Publicly Supported Organization (509(a)(1))',
    '15': 'Publicly Supported Organization (509(a)(2))',
    '16': 'Supporting Organization',
    '17': 'Community Trust',
    '18': 'Publicly Supported Organization (170(b)(1)(A)(vi))',
};
/** POST /api/ein-lookup
 * Body: { ein: string }
 * Fetches org info from ProPublica (IRS BMF + 990s) and USASpending.gov (past federal grants).
 * Returns: { orgName, text }
 */
router.post('/', async (req, res) => {
    try {
        const ein = typeof req.body.ein === 'string' ? req.body.ein.replace(/\D/g, '') : '';
        if (!ein || ein.length !== 9) {
            res.status(400).json({ error: 'A valid 9-digit EIN is required.' });
            return;
        }
        const proPublicaRes = await fetch(`https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`);
        if (proPublicaRes.status === 404) {
            res.status(404).json({ error: 'No nonprofit found for that EIN. Make sure it is a registered 501(c)(3).' });
            return;
        }
        if (!proPublicaRes.ok) {
            res.status(502).json({ error: 'Failed to reach ProPublica Nonprofit Explorer. Try again later.' });
            return;
        }
        const data = await proPublicaRes.json();
        const org = data.organization;
        if (!org?.name) {
            res.status(404).json({ error: 'Organization data not found for that EIN.' });
            return;
        }
        // --- Section 1: IRS BMF (decoded from ProPublica) ---
        const parts = ['=== IRS Business Master File (BMF) ==='];
        parts.push(`Organization Name: ${org.name}`);
        if (org.city && org.state)
            parts.push(`Location: ${org.city}, ${org.state}`);
        const nteeCategory = org.ntee_code ? org.ntee_code.charAt(0).toUpperCase() : '';
        if (org.ntee_code) {
            const nteeDesc = NTEE_DESCRIPTIONS[nteeCategory] ?? 'Unknown';
            parts.push(`Mission Category (NTEE): ${org.ntee_code} — ${nteeDesc}`);
        }
        if (org.subsection_code) {
            const subDesc = SUBSECTION_DESCRIPTIONS[String(org.subsection_code)] ?? `501(c)(${org.subsection_code})`;
            parts.push(`Tax-Exempt Status: ${subDesc}`);
        }
        if (org.foundation_code) {
            const foundDesc = FOUNDATION_DESCRIPTIONS[String(org.foundation_code)] ?? `Foundation Code ${org.foundation_code}`;
            parts.push(`Foundation Type: ${foundDesc}`);
        }
        if (org.ruling_date)
            parts.push(`IRS Ruling Date: ${org.ruling_date}`);
        if (org.deductibility_code === 1)
            parts.push('Tax Deductibility: Contributions are deductible');
        if (org.revenue_amount)
            parts.push(`Total Revenue: $${org.revenue_amount.toLocaleString()}`);
        if (org.asset_amount)
            parts.push(`Total Assets: $${org.asset_amount.toLocaleString()}`);
        // --- Section 2: IRS 990 Filings ---
        const recentFilings = (data.filings_with_data ?? []).slice(0, 3);
        if (recentFilings.length > 0) {
            parts.push('\n=== IRS 990 Filing Summaries ===');
            for (const f of recentFilings) {
                const lines = [`  Year: ${f.tax_prd_yr ?? 'Unknown'}`];
                if (f.totrevenue)
                    lines.push(`  Total Revenue: $${f.totrevenue.toLocaleString()}`);
                if (f.totfuncexpns)
                    lines.push(`  Total Expenses: $${f.totfuncexpns.toLocaleString()}`);
                if (f.totassetsend)
                    lines.push(`  Total Assets (End of Year): $${f.totassetsend.toLocaleString()}`);
                parts.push(lines.join('\n'));
            }
        }
        // --- Section 3: USASpending.gov — past federal grants ---
        let usaSpendingSearchName = org.name;
        try {
            const acRes = await fetch('https://api.usaspending.gov/api/v2/autocomplete/recipient/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ search_text: org.name, limit: 1 }),
                signal: AbortSignal.timeout(5000),
            });
            if (acRes.ok) {
                const acData = await acRes.json();
                const normalizedName = acData.results?.[0]?.recipient_name;
                if (normalizedName)
                    usaSpendingSearchName = normalizedName;
            }
        }
        catch { /* fall back to org.name */ }
        const usaSpendingData = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filters: {
                    award_type_codes: ['02', '03', '04', '05'],
                    recipient_search_text: [usaSpendingSearchName],
                },
                fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Start Date', 'Description', 'CFDA Number', 'CFDA Title'],
                page: 1,
                limit: 10,
                sort: 'Award Amount',
                order: 'desc',
            }),
        })
            .then(async (r) => {
            if (!r.ok)
                return null;
            return r.json();
        })
            .catch(() => null);
        const awards = usaSpendingData?.results ?? [];
        if (awards.length > 0) {
            parts.push('\n=== USASpending.gov — Past Federal Grants ===');
            parts.push(`(${awards.length} federal grant(s) found — indicates eligibility for similar programs)`);
            for (const award of awards) {
                const lines = [];
                if (award['Awarding Agency'])
                    lines.push(`  Agency: ${award['Awarding Agency']}`);
                if (award['CFDA Number'] && award['CFDA Title'])
                    lines.push(`  Program: ${award['CFDA Title']} (CFDA ${award['CFDA Number']})`);
                else if (award['CFDA Number'])
                    lines.push(`  CFDA: ${award['CFDA Number']}`);
                if (award['Award Amount'])
                    lines.push(`  Amount: $${award['Award Amount'].toLocaleString()}`);
                if (award['Start Date'])
                    lines.push(`  Start Date: ${award['Start Date']}`);
                if (award['Description'])
                    lines.push(`  Description: ${award['Description']}`);
                parts.push(lines.join('\n'));
            }
        }
        else {
            parts.push('\n=== USASpending.gov ===\nNo prior federal grant awards found. Organization may be new or primarily privately funded.');
        }
        res.json({ orgName: org.name, text: parts.join('\n') });
    }
    catch (err) {
        console.error('EIN lookup error:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'EIN lookup failed' });
    }
});
export default router;
