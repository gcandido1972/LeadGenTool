/**
 * briefTemplate.js
 * Generates the full HTML that Puppeteer renders to PDF.
 * A4 format, Omega Praxis dark brand.
 */

export function generateBriefHtml(data) {
  const { company, ceoName, domain, pillars, generatedAt,
          pocBrief, pocStrategic, ceoPainPoints, linkedinSummary } = data;

  // Derive a short domain display
  const domainDisplay = domain || (company || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  // Build pillar rows — only show rows that have content
  const pillarRows = buildPillarRows(pillars, pocStrategic);

  // Extract top 2–3 pain points for the brief
  const painSummary = extractPainSummary(ceoPainPoints, linkedinSummary);

  // 90-day roadmap items from strategic data
  const roadmapItems = buildRoadmap(pillars, pocStrategic);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Growth Brief — ${esc(company)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: #ffffff;
    color: #1a1a1c;
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── PAGE LAYOUT ── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 0;
    position: relative;
    page-break-after: always;
  }

  /* ── COVER PAGE ── */
  .cover {
    background: #0e0e0f;
    color: #f0efe8;
    display: flex;
    flex-direction: column;
    min-height: 297mm;
  }

  .cover-top {
    padding: 40px 48px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .logo-mark {
    font-family: 'DM Serif Display', serif;
    font-size: 18px;
    color: #c8e86b;
    letter-spacing: -0.02em;
  }

  .cover-label {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: #5e5d59;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .cover-body {
    flex: 1;
    padding: 0 48px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-top: 80px;
    padding-bottom: 60px;
  }

  .cover-eyebrow {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: #c8e86b;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 20px;
  }

  .cover-title {
    font-family: 'DM Serif Display', serif;
    font-size: 42px;
    line-height: 1.1;
    color: #f0efe8;
    letter-spacing: -0.02em;
    margin-bottom: 16px;
  }

  .cover-subtitle {
    font-size: 15px;
    color: #9b9a95;
    font-weight: 300;
    max-width: 420px;
    line-height: 1.6;
    margin-bottom: 48px;
  }

  .cover-divider {
    width: 40px;
    height: 2px;
    background: #c8e86b;
    margin-bottom: 32px;
  }

  .cover-meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    max-width: 480px;
  }

  .meta-item {}
  .meta-label {
    font-family: 'DM Mono', monospace;
    font-size: 8px;
    color: #5e5d59;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 4px;
  }
  .meta-value {
    font-size: 12px;
    color: #f0efe8;
    font-weight: 400;
  }

  .cover-footer {
    padding: 24px 48px;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cover-footer-left {
    font-size: 10px;
    color: #5e5d59;
  }

  .cover-url {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: #5e5d59;
  }

  /* ── CONTENT PAGES ── */
  .content-page {
    padding: 48px;
    background: #ffffff;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 36px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e8e7e0;
  }

  .section-label {
    font-family: 'DM Mono', monospace;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #9b9a95;
  }

  .page-logo {
    font-family: 'DM Serif Display', serif;
    font-size: 13px;
    color: #c8e86b;
    background: #0e0e0f;
    padding: 4px 10px;
    border-radius: 4px;
  }

  /* ── SECTION HEADING ── */
  .section-title {
    font-family: 'DM Serif Display', serif;
    font-size: 26px;
    letter-spacing: -0.02em;
    color: #0e0e0f;
    margin-bottom: 6px;
    line-height: 1.15;
  }

  .section-intro {
    font-size: 12px;
    color: #6b6a65;
    margin-bottom: 28px;
    max-width: 540px;
    line-height: 1.7;
  }

  /* ── CALLOUT BOX ── */
  .callout {
    background: #f7f6f0;
    border-left: 3px solid #c8e86b;
    border-radius: 0 6px 6px 0;
    padding: 16px 20px;
    margin-bottom: 28px;
  }

  .callout-label {
    font-family: 'DM Mono', monospace;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #9b9a95;
    margin-bottom: 6px;
  }

  .callout-text {
    font-size: 12px;
    color: #1a1a1c;
    line-height: 1.65;
  }

  /* ── PILLAR TABLE ── */
  .pillars-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 28px;
    font-size: 10.5px;
  }

  .pillars-table th {
    background: #0e0e0f;
    color: #c8e86b;
    font-family: 'DM Mono', monospace;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 500;
    padding: 10px 14px;
    text-align: left;
  }

  .pillars-table th:first-child { border-radius: 6px 0 0 0; }
  .pillars-table th:last-child  { border-radius: 0 6px 0 0; }

  .pillars-table td {
    padding: 11px 14px;
    border-bottom: 1px solid #e8e7e0;
    vertical-align: top;
    line-height: 1.55;
    color: #1a1a1c;
  }

  .pillars-table tr:last-child td { border-bottom: none; }
  .pillars-table tr:nth-child(even) td { background: #faf9f4; }

  .pillar-name {
    font-weight: 500;
    font-size: 10px;
    font-family: 'DM Mono', monospace;
    color: #0e0e0f;
    white-space: nowrap;
  }

  .gap-badge {
    display: inline-block;
    background: #fef3cd;
    color: #7a5c00;
    font-size: 8px;
    font-family: 'DM Mono', monospace;
    padding: 2px 7px;
    border-radius: 20px;
    white-space: nowrap;
  }

  .gap-badge.critical {
    background: #fde8e8;
    color: #8b1f1f;
  }

  .gap-badge.opportunity {
    background: #e6f7ed;
    color: #1a6b38;
  }

  /* ── ROADMAP ── */
  .roadmap-phases {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 14px;
    margin-bottom: 28px;
  }

  .phase-card {
    border: 1px solid #e8e7e0;
    border-radius: 8px;
    overflow: hidden;
  }

  .phase-header {
    background: #0e0e0f;
    padding: 10px 14px;
  }

  .phase-num {
    font-family: 'DM Mono', monospace;
    font-size: 8px;
    color: #5e5d59;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .phase-title {
    font-size: 11px;
    font-weight: 500;
    color: #f0efe8;
    margin-top: 3px;
  }

  .phase-body {
    padding: 12px 14px;
    background: #fff;
  }

  .phase-item {
    font-size: 10px;
    color: #3a3a3c;
    padding: 4px 0;
    border-bottom: 1px solid #f0efe8;
    line-height: 1.5;
    display: flex;
    gap: 7px;
    align-items: flex-start;
  }

  .phase-item:last-child { border-bottom: none; }

  .phase-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #c8e86b;
    margin-top: 5px;
    flex-shrink: 0;
  }

  /* ── CTA PAGE ── */
  .cta-page {
    background: #0e0e0f;
    color: #f0efe8;
    min-height: 297mm;
    padding: 60px 48px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .cta-eyebrow {
    font-family: 'DM Mono', monospace;
    font-size: 9px;
    color: #c8e86b;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 24px;
  }

  .cta-title {
    font-family: 'DM Serif Display', serif;
    font-size: 36px;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin-bottom: 24px;
    max-width: 460px;
  }

  .cta-body {
    font-size: 13px;
    color: #9b9a95;
    max-width: 460px;
    line-height: 1.75;
    margin-bottom: 40px;
  }

  .cta-services {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    max-width: 480px;
    margin-bottom: 40px;
  }

  .service-item {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 14px 16px;
  }

  .service-name {
    font-size: 12px;
    font-weight: 500;
    color: #f0efe8;
    margin-bottom: 4px;
  }

  .service-price {
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    color: #c8e86b;
  }

  .service-desc {
    font-size: 10px;
    color: #5e5d59;
    margin-top: 4px;
    line-height: 1.5;
  }

  .cta-link {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    color: #c8e86b;
    border-bottom: 1px solid rgba(200,232,107,0.3);
    padding-bottom: 2px;
    display: inline-block;
    margin-bottom: 48px;
  }

  .cta-footer {
    margin-top: auto;
    padding-top: 40px;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .cta-sig { font-size: 12px; color: #9b9a95; }
  .cta-sig strong { color: #f0efe8; font-weight: 500; display: block; margin-bottom: 2px; }
</style>
</head>
<body>

<!-- ════ PAGE 1: COVER ════ -->
<div class="page cover">
  <div class="cover-top">
    <div class="logo-mark">Omega·Praxis</div>
    <div class="cover-label">Confidential · Growth Brief</div>
  </div>

  <div class="cover-body">
    <div class="cover-eyebrow">GTM &amp; Positioning Analysis</div>
    <div class="cover-title">${esc(company)}</div>
    <div class="cover-subtitle">
      A strategic growth audit across Branding, Marketing, Sales, and Partnerships —
      with a 90-day action roadmap.
    </div>
    <div class="cover-divider"></div>
    <div class="cover-meta-grid">
      <div class="meta-item">
        <div class="meta-label">Prepared for</div>
        <div class="meta-value">${esc(ceoName)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Company</div>
        <div class="meta-value">${esc(company)}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Prepared by</div>
        <div class="meta-value">Gianni Candido</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Date</div>
        <div class="meta-value">${generatedAt}</div>
      </div>
    </div>
  </div>

  <div class="cover-footer">
    <div class="cover-footer-left">Omega Praxis · contact@omegapraxis.com</div>
    <div class="cover-url">omegapraxis.com</div>
  </div>
</div>

<!-- ════ PAGE 2: STRATEGIC GAPS ════ -->
<div class="page content-page">
  <div class="page-header">
    <div class="section-label">Section 01 — Growth Opportunities &amp; Strategic Gaps</div>
    <div class="page-logo">OP</div>
  </div>

  <div class="section-title">Where the growth<br><em>is being left behind</em></div>
  <div class="section-intro">
    Based on a review of your public positioning, LinkedIn presence, and market signals,
    here are the highest-leverage gaps across your four growth pillars.
  </div>

  ${painSummary ? `
  <div class="callout">
    <div class="callout-label">CEO Signal — what your LinkedIn activity reveals</div>
    <div class="callout-text">${esc(painSummary)}</div>
  </div>` : ''}

  <table class="pillars-table">
    <thead>
      <tr>
        <th style="width:90px;">Pillar</th>
        <th>Current state</th>
        <th>Strategic gap</th>
        <th style="width:90px;">Priority</th>
      </tr>
    </thead>
    <tbody>
      ${pillarRows}
    </tbody>
  </table>
</div>

<!-- ════ PAGE 3: 90-DAY ROADMAP ════ -->
<div class="page content-page">
  <div class="page-header">
    <div class="section-label">Section 02 — 90-Day Action Roadmap</div>
    <div class="page-logo">OP</div>
  </div>

  <div class="section-title">90 days to a<br><em>measurable growth system</em></div>
  <div class="section-intro">
    Three phases, sequenced by leverage. Each action is chosen based on
    the specific gaps identified for ${esc(company)}.
  </div>

  <div class="roadmap-phases">
    ${roadmapItems.map((phase, i) => `
    <div class="phase-card">
      <div class="phase-header">
        <div class="phase-num">Days ${[1, 31, 61][i]}–${[30, 60, 90][i]}</div>
        <div class="phase-title">${esc(phase.title)}</div>
      </div>
      <div class="phase-body">
        ${phase.items.map(item => `
        <div class="phase-item">
          <span class="phase-dot"></span>
          <span>${esc(item)}</span>
        </div>`).join('')}
      </div>
    </div>`).join('')}
  </div>

  <div class="callout">
    <div class="callout-label">How Omega Praxis accelerates this</div>
    <div class="callout-text">
      The platform generates AI-powered strategies across all four pillars, produces
      ready-to-use content, and tracks roadmap execution — so you move from analysis
      to implementation in days, not weeks. Strategic guidance sessions with Gianni
      are available to pressure-test decisions at each phase gate.
    </div>
  </div>
</div>

<!-- ════ PAGE 4: CTA ════ -->
<div class="page cta-page">
  <div class="cta-eyebrow">Section 03 — How we work together</div>
  <div class="cta-title">The next step?<br>A 30-minute conversation.</div>
  <div class="cta-body">
    Omega Praxis replaces the €10K–€50K strategy consultant with an AI-powered
    growth system built specifically for scaling SMBs. The consulting relationship
    always comes first — the platform is your execution engine.
  </div>

  <div class="cta-services">
    <div class="service-item">
      <div class="service-name">Kickstart Session</div>
      <div class="service-price">€175 · 60 min</div>
      <div class="service-desc">Map your biggest growth lever and leave with a prioritised action plan.</div>
    </div>
    <div class="service-item">
      <div class="service-name">Strategy Session</div>
      <div class="service-price">€300 · 90 min</div>
      <div class="service-desc">Deep dive across all four pillars with a 90-day blueprint.</div>
    </div>
    <div class="service-item">
      <div class="service-name">Monthly Review</div>
      <div class="service-price">€225 · 60 min</div>
      <div class="service-desc">Ongoing strategic accountability and course correction.</div>
    </div>
    <div class="service-item">
      <div class="service-name">Platform Access</div>
      <div class="service-price">From €990/yr</div>
      <div class="service-desc">AI growth tools across all four pillars, 90-day roadmaps, content engine.</div>
    </div>
  </div>

  <a class="cta-link" href="https://omegapraxis.com/strategic-guidance">
    omegapraxis.com/strategic-guidance →
  </a>

  <div class="cta-footer">
    <div class="cta-sig">
      <strong>Gianni Candido</strong>
      Founder, Omega Praxis<br>
      contact@omegapraxis.com
    </div>
    <div style="font-family:'DM Serif Display',serif;font-size:20px;color:#c8e86b;">Omega·Praxis</div>
  </div>
</div>

</body>
</html>`;
}

// ── Template helpers ──────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPillarRows(pillars, rawStrategic) {
  const rows = [
    {
      name: 'Branding',
      current: pillars.branding.vp || pillars.branding.clarity || 'See strategic notes',
      gap: pillars.branding.gap || extractSentence(rawStrategic, 'brand'),
      priority: scoreGap(pillars.branding.gap)
    },
    {
      name: 'Marketing',
      current: pillars.marketing.content || 'See strategic notes',
      gap: pillars.marketing.gap || extractSentence(rawStrategic, 'marketing'),
      priority: scoreGap(pillars.marketing.gap)
    },
    {
      name: 'Sales',
      current: pillars.sales.funnel || pillars.sales.proof || 'See strategic notes',
      gap: pillars.sales.gap || extractSentence(rawStrategic, 'sales'),
      priority: scoreGap(pillars.sales.gap)
    },
    {
      name: 'Partnerships',
      current: pillars.partnerships.existing || 'See strategic notes',
      gap: pillars.partnerships.gap || extractSentence(rawStrategic, 'partner'),
      priority: scoreGap(pillars.partnerships.gap)
    }
  ];

  return rows.map(r => `
    <tr>
      <td><span class="pillar-name">${r.name}</span></td>
      <td>${esc(truncate(r.current, 120))}</td>
      <td>${esc(truncate(r.gap, 120))}</td>
      <td><span class="gap-badge ${r.priority.cls}">${r.priority.label}</span></td>
    </tr>`).join('');
}

function buildRoadmap(pillars, rawStrategic) {
  // Pull the most concrete gaps as roadmap actions
  const gaps = [
    pillars.branding.gap,
    pillars.marketing.gap,
    pillars.sales.gap,
    pillars.partnerships.gap,
  ].filter(Boolean);

  return [
    {
      title: 'Positioning foundation',
      items: [
        gaps[0] ? `Fix: ${truncate(gaps[0], 60)}` : 'Clarify value proposition for primary ICP',
        'Audit homepage messaging against buyer language',
        'Define 3 core differentiators with evidence'
      ]
    },
    {
      title: 'Pipeline activation',
      items: [
        gaps[1] ? `Launch: ${truncate(gaps[1], 55)}` : 'Activate LinkedIn thought leadership content',
        'Set up email nurture sequence for top-of-funnel',
        'Instrument conversion tracking on key landing pages'
      ]
    },
    {
      title: 'Revenue acceleration',
      items: [
        gaps[2] ? `Close gap: ${truncate(gaps[2], 50)}` : 'Build metrics-backed social proof library',
        gaps[3] ? `Partnerships: ${truncate(gaps[3], 48)}` : 'Identify 3 co-sell or referral partnership targets',
        'Review pricing presentation and ROI framing'
      ]
    }
  ];
}

function extractPainSummary(ceoPainPoints, linkedinSummary) {
  // Prefer LinkedIn summary as it's more narrative
  if (linkedinSummary && linkedinSummary.length > 50 && !linkedinSummary.includes('N/A')) {
    return truncate(linkedinSummary, 300);
  }
  if (ceoPainPoints && !ceoPainPoints.includes('N/A')) {
    return truncate(ceoPainPoints, 300);
  }
  return '';
}

function scoreGap(gap) {
  if (!gap || gap.includes('N/A')) return { label: 'Monitor', cls: 'opportunity' };
  const lower = gap.toLowerCase();
  if (lower.includes('no') || lower.includes('missing') || lower.includes('none') || lower.includes('gap')) {
    return { label: 'Critical', cls: 'critical' };
  }
  return { label: 'High', cls: '' };
}

function extractSentence(text, keyword) {
  if (!text) return '';
  const sentences = text.split(/[.\n]/);
  const match = sentences.find(s => s.toLowerCase().includes(keyword.toLowerCase()));
  return match ? match.trim() : '';
}

function truncate(str, max) {
  if (!str) return '';
  str = str.trim();
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}
