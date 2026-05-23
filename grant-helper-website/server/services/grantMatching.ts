import { openai } from '../config.js';

/** Score and rank a grant's relevance to an organization */
export async function scoreGrantMatch(
  orgProfile: Record<string, unknown>,
  grantData: Record<string, unknown>
): Promise<{ score: number; explanation: string }> {
  const systemPrompt = `You are an expert grant consultant with 15+ years of experience matching nonprofits to funding opportunities. Score how well a grant matches an organization on a scale of 0-100 using a rigorous, multi-factor analysis.

CALIBRATION EXAMPLES - Study these to understand proper scoring:

EXAMPLE 1 - Excellent Local Match (Score: 88):
Org: Small education nonprofit, $75k budget, Pittsburgh PA, STEM programs for high schoolers, 8 years operating, 501(c)(3)
Grant: Pennsylvania Department of Education STEM Grant, $50k-150k awards, PA nonprofits only, supports after-school STEM programs
Analysis: "Organization is based in Pennsylvania and meets state eligibility requirements perfectly. Budget alignment is excellent with the grant range ($50k-150k) representing 67-200% of current budget, which is highly sustainable. Mission alignment is perfect: both focus on STEM education for high school students with after-school programming. As a state grant, competition is significantly lower than national grants and gives geographic preference. Strong match - highly recommend applying."

EXAMPLE 2 - Good National Match (Score: 72):
Org: Medium health nonprofit, $500k budget, Detroit MI, mental health services, 12 years operating, 501(c)(3)
Grant: AmeriCorps State and National, $100k-500k awards, national scope, supports health and education community service programs
Analysis: "Organization is eligible as a 501(c)(3) nonprofit with no geographic restrictions for this national grant. Budget alignment is good - grant range ($100k-500k) fits well within organizational capacity. Mission alignment is strong: AmeriCorps supports health services including mental health. However, as a national competitive grant, competition level is high with no geographic preference. Solid match worth pursuing if capacity allows for competitive application process."

EXAMPLE 3 - Weak Mission Mismatch (Score: 35):
Org: Small arts nonprofit, $150k budget, Brooklyn NY, youth theater programs, 5 years operating, 501(c)(3)
Grant: NASA STEM Workforce Development Hub, $250k-1M awards, national, focuses on aerospace technical training and workforce development
Analysis: "Organization meets basic eligibility as a 501(c)(3). However, mission alignment is very poor: grant specifically targets aerospace workforce development while organization specializes in arts and theater programming with no STEM component. Budget alignment is challenging - grant minimum ($250k) significantly exceeds org's total budget ($150k), suggesting grant is designed for substantially larger organizations. No geographic advantage. Not recommended - pursue arts education and youth development grants instead."

EXAMPLE 4 - Geographic Ineligibility (Score: 12):
Org: Rural education nonprofit, $40k budget, Lexington Kentucky, literacy programs, 4 years operating, 501(c)(3)
Grant: California State Arts Council Grant, $25k-75k awards, restricted to California-based nonprofits only
Analysis: "Organization does not meet fundamental geographic eligibility requirements - grant is explicitly restricted to California-based organizations and this organization is headquartered in Kentucky. While mission areas (education/arts/youth) have some thematic overlap and budget range would be appropriate, the geographic restriction is an absolute disqualifier. Do not apply - organization is ineligible regardless of other factors."

EXAMPLE 5 - Budget Mismatch Despite Mission Fit (Score: 42):
Org: Micro animal rescue, $30k budget, Denver CO, pet adoption programs, 3 years operating, 501(c)(3)
Grant: National Animal Welfare Foundation Major Grants, $500k-2M awards, national, supports large-scale shelter operations and regional programs
Analysis: "Organization is eligible and mission alignment is excellent - both focus on animal welfare, rescue operations, and adoption services. However, budget alignment is severely problematic: grant minimum ($500k) is over 16x the organization's annual budget, clearly indicating this grant targets major regional shelters with substantial infrastructure, not small local rescues. Managing such a large grant would overwhelm organizational capacity. Competition from large established shelters would be intense. Weak match - organization should pursue smaller regional animal welfare grants ($10k-50k range) instead."`;

  const userPrompt = `Now analyze this NEW organization and grant match using the same rigorous criteria and scoring calibration shown above:

Organization Profile:
${JSON.stringify(orgProfile, null, 2)}

Grant Opportunity:
${JSON.stringify(grantData, null, 2)}

Analyze this match using the following weighted criteria:

1. ELIGIBILITY (Pass/Fail - if fail, score must be ≤25):
   - Organization type (501c3, government, etc.)
   - Geographic restrictions (state-specific vs national)
   - Organization size/budget requirements
   - Years in operation requirements

2. BUDGET ALIGNMENT (Weight: 25%):
   - Grant amount vs org's annual budget (ideal: 10-50% of budget)
   - Award floor/ceiling vs org's capacity
   - Matching requirements vs org's resources
   Score: 100 if perfect fit, 50 if workable, 0 if unrealistic

3. GEOGRAPHIC FIT (Weight: 30%):
   - HIGHEST PRIORITY: State/local grants matching org's location
   - MEDIUM: Regional grants that include org's state
   - LOWER: National grants (more competition)
   - Consider: Does grant explicitly target org's city/county/state?
   Score: 100 for local/state match, 70 for regional, 50 for national eligible, 0 if restricted elsewhere

4. MISSION ALIGNMENT (Weight: 35%):
   - Does grant's focus area directly match org's programs?
   - Are target populations aligned?
   - Do activities/outcomes match org's expertise?
   Score: 100 for perfect mission match, 70 for strong overlap, 40 for partial, 0 for no alignment

5. COMPETITION & FEASIBILITY (Weight: 10%):
   - Application complexity vs org's staff capacity
   - Likely competition level
   - Timeline to deadline
   Score: 100 for good fit, 50 for challenging, 0 if not feasible

SCORING GUIDANCE:
- 90-100: Excellent match - highly recommend applying
- 75-89: Strong match - good fit, worth pursuing
- 60-74: Moderate match - consider if capacity allows
- 40-59: Weak match - only if no better options
- 0-39: Poor match - not recommended

Return JSON with:
{
  "score": <0-100>,
  "explanation": "<2-3 sentence explanation covering eligibility, budget fit, geographic priority, and mission alignment>"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const result = completion.choices[0]?.message?.content?.trim() ?? '{"score": 0, "explanation": "Unable to score"}';
  return JSON.parse(result);
}

/** Pass 1: Quick eligibility check to filter out obviously ineligible grants */
export async function quickEligibilityCheck(
  orgProfile: Record<string, unknown>,
  grantData: Record<string, unknown>
): Promise<{ eligible: boolean; reason?: string }> {
  const systemPrompt = `You are a grant eligibility screener. Quickly determine if an organization is eligible for a grant based on basic requirements.`;
  const userPrompt = `Organization Profile:
${JSON.stringify(orgProfile, null, 2)}

Grant Opportunity:
${JSON.stringify(grantData, null, 2)}

Perform a QUICK eligibility check. Check ONLY these critical factors:
1. Organization type allowed? (501c3, government, etc.)
2. Geographic restrictions met? (Is org in an allowed location?)
3. Basic budget requirements met? (Is award size remotely reasonable for org?)

Return JSON:
{
  "eligible": true/false,
  "reason": "Brief reason if ineligible (e.g., 'Geographic restriction: grant limited to California only')"
}

If any factor is clearly violated, return eligible: false. When in doubt, return eligible: true.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const result = completion.choices[0]?.message?.content?.trim() ?? '{"eligible": true}';
  return JSON.parse(result);
}

/** Pass 3: Generate application tips for top matches */
export async function generateApplicationTips(
  orgProfile: Record<string, unknown>,
  grantData: Record<string, unknown>,
  matchScore: number
): Promise<string> {
  const systemPrompt = `You are an expert grant consultant helping nonprofits write winning applications. Provide specific, actionable advice for applying to this grant.`;
  const userPrompt = `Organization Profile:
${JSON.stringify(orgProfile, null, 2)}

Grant Opportunity (Match Score: ${matchScore}%):
${JSON.stringify(grantData, null, 2)}

Based on this organization's profile and the grant requirements, provide 3-4 specific application tips.

Focus on:
1. What to emphasize in their application (specific strengths that match grant priorities)
2. Suggested funding amount (realistic range based on org's budget and grant limits)
3. Key points to highlight in narrative sections
4. Any concerns to address proactively

Keep each tip to 1-2 sentences. Be specific and actionable.

Return as a plain string with tips separated by newlines (not JSON).`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.5,
  });

  return completion.choices[0]?.message?.content?.trim() ?? '';
}
