/**
 * parseClayFields.js
 * Normalises the raw query/body params Clay sends.
 * Clay field names from the screenshot:
 *   company, poc_brief, poc_strategic, ceo_pain_points,
 *   linkedin_summary, founder_challenges
 *
 * The email field can arrive as part of poc_brief or as a separate
 * `email` param — we handle both.
 */

export function parseClayFields(raw) {
  const company      = clean(raw.company);
  const pocBrief     = clean(raw.poc_brief);
  const pocStrategic = clean(raw.poc_strategic);
  const ceoPainPts   = clean(raw.ceo_pain_points);
  const linkedinSum  = clean(raw.linkedin_summary);
  const founderChal  = clean(raw.founder_challenges);

  // Extract CEO name from poc_brief: "CEO NAME: John Smith\n..."
  const ceoName = extractField(pocBrief, 'CEO NAME') || clean(raw.ceo_name) || 'there';

  // Extract email — Clay may send it directly or embedded in poc_brief
  const email =
    clean(raw.email) ||
    clean(raw.ceo_email) ||
    extractField(pocBrief, 'CEO EMAIL') ||
    extractEmail(pocBrief) ||
    '';

  // Extract LinkedIn URL
  const linkedinUrl =
    clean(raw.linkedin_url) ||
    clean(raw.ceo_linkedin) ||
    extractField(pocBrief, 'CEO LINKEDIN') ||
    '';

  // Extract domain
  const domain =
    clean(raw.domain) ||
    extractField(pocBrief, 'DOMAIN') ||
    '';

  // Parse four-pillar strategic data from poc_strategic
  const pillars = parsePillars(pocStrategic);

  return {
    company,
    ceoName,
    email,
    linkedinUrl,
    domain,
    pocBrief,
    pocStrategic,
    ceoPainPoints: ceoPainPts,
    linkedinSummary: linkedinSum,
    founderChallenges: founderChal,
    pillars,          // { branding, marketing, sales, partnerships }
    generatedAt: new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
  };
}

// ── Helpers ───────────────────────────────────────────────────

function clean(val) {
  if (!val) return '';
  return String(val).trim();
}

function extractField(text, fieldName) {
  if (!text) return '';
  // Matches "FIELD NAME: value\n" or "FIELD NAME: value" at end
  const re = new RegExp(fieldName + '[:\\s]+([^\\n]+)', 'i');
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

function extractEmail(text) {
  if (!text) return '';
  const m = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  return m ? m[0] : '';
}

/**
 * poc_strategic from the screenshot looks like:
 * "Branding_VP: \"...\"\nBranding_clarity: ...\nBranding_gap: ...\nMarketing_content: ...\n..."
 * We parse each section into a structured object.
 */
function parsePillars(text) {
  if (!text) return { branding: {}, marketing: {}, sales: {}, partnerships: {} };

  const get = (key) => {
    const re = new RegExp(key + '[:\\s]+"?([^"\\n]+)"?', 'i');
    const m = text.match(re);
    return m ? m[1].trim() : '';
  };

  return {
    branding: {
      vp:      get('Branding_VP') || get('Branding VP'),
      clarity: get('Branding_clarity') || get('Branding clarity'),
      gap:     get('Branding_gap') || get('Branding gap'),
    },
    marketing: {
      content:    get('Marketing_content') || get('Marketing content'),
      leadGen:    get('Marketing_lead') || get('Marketing lead'),
      gap:        get('Marketing_gap') || get('Marketing gap'),
    },
    sales: {
      funnel:  get('Sales_funnel') || get('Sales funnel'),
      proof:   get('Sales_proof') || get('Sales proof'),
      gap:     get('Sales_gap') || get('Sales gap'),
    },
    partnerships: {
      existing: get('Partnership_existing') || get('Partnerships_existing'),
      gap:      get('Partnership_gap') || get('Partnerships_gap'),
    }
  };
}
