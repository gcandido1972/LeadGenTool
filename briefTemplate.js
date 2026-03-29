/**
 * briefTemplate.js
 * Generates a branded PDF using PDFKit — pure Node, no browser.
 * 4 pages: Cover · Strategic Gaps · 90-Day Roadmap · CTA
 */

import PDFDocument from 'pdfkit';

const C = {
  black:    '#0e0e0f', offwhite: '#f0efe8', text:     '#1a1a1c',
  muted:    '#6b6a65', border:   '#e8e7e0', surface:  '#f7f6f0',
  lime:     '#c8e86b', limeDim:  '#eef7c8', red:      '#fde8e8',
  redText:  '#8b1f1f', amber:    '#fef3cd', amberText:'#7a5c00',
  green:    '#e6f7ed', greenText:'#1a6b38', white:    '#ffffff',
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

export function generateBriefPdf(data) {
  return new Promise((resolve, reject) => {
    const { company, ceoName, generatedAt, pillars, pocStrategic, ceoPainPoints, linkedinSummary } = data;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: { Title: `Growth Brief — ${company}`, Author: 'Gianni Candido, Omega Praxis' }
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawCover(doc, company, ceoName, generatedAt);
    doc.addPage();
    drawGapsPage(doc, data);
    doc.addPage();
    drawRoadmapPage(doc, data);
    doc.addPage();
    drawCtaPage(doc, company);

    doc.end();
  });
}

// ── PAGE 1: COVER ─────────────────────────────────────────────
function drawCover(doc, company, ceoName, generatedAt) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.black);
  doc.rect(0, 0, 4, PAGE_H).fill(C.lime);

  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.lime).text('Omega·Praxis', MARGIN, 40);
  doc.font('Helvetica').fontSize(8).fillColor('#5e5d59').text('CONFIDENTIAL · GROWTH BRIEF', PAGE_W - MARGIN - 160, 44);

  const bodyY = 200;
  doc.font('Helvetica').fontSize(9).fillColor(C.lime).text('GTM & POSITIONING ANALYSIS', MARGIN, bodyY, { characterSpacing: 1.5 });
  doc.font('Helvetica-Bold').fontSize(44).fillColor(C.offwhite).text(company, MARGIN, bodyY + 22, { width: PAGE_W - MARGIN * 2, lineGap: 4 });

  const titleBottom = doc.y + 14;
  doc.rect(MARGIN, titleBottom, 40, 2).fill(C.lime);

  doc.font('Helvetica').fontSize(12).fillColor('#9b9a95')
     .text('A strategic growth audit across Branding, Marketing,\nSales, and Partnerships — with a 90-day action roadmap.', MARGIN, titleBottom + 18, { width: 400, lineGap: 4 });

  const metaY = titleBottom + 88;
  [['PREPARED FOR', ceoName || 'CEO'], ['COMPANY', company], ['PREPARED BY', 'Gianni Candido'], ['DATE', generatedAt]].forEach(([label, value], i) => {
    const x = MARGIN + (i % 2) * 240;
    const y = metaY + Math.floor(i / 2) * 52;
    doc.font('Helvetica').fontSize(8).fillColor('#5e5d59').text(label, x, y, { characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(12).fillColor(C.offwhite).text(value || '—', x, y + 13);
  });

  doc.rect(0, PAGE_H - 56, PAGE_W, 0.5).fill('#1e1e20');
  doc.font('Helvetica').fontSize(9).fillColor('#5e5d59').text('Omega Praxis · contact@omegapraxis.com', MARGIN, PAGE_H - 36);
  doc.font('Helvetica').fontSize(9).fillColor('#5e5d59').text('omegapraxis.com', PAGE_W - MARGIN - 80, PAGE_H - 36);
}

// ── PAGE 2: GAPS ──────────────────────────────────────────────
function drawGapsPage(doc, data) {
  const { company, pillars, pocStrategic, ceoPainPoints, linkedinSummary } = data;
  drawPageHeader(doc, 'Section 01 — Growth Opportunities & Strategic Gaps');
  let y = 100;

  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.text).text('Where the growth', MARGIN, y);
  doc.font('Helvetica-BoldOblique').fontSize(24).fillColor(C.text).text('is being left behind', MARGIN, y + 30);
  y += 74;

  doc.font('Helvetica').fontSize(10.5).fillColor(C.muted)
     .text(`Based on a review of ${company}'s public positioning, LinkedIn presence, and market signals — here are the highest-leverage gaps across your four growth pillars.`, MARGIN, y, { width: PAGE_W - MARGIN * 2, lineGap: 2 });
  y = doc.y + 16;

  const pain = extractPainSummary(ceoPainPoints, linkedinSummary);
  if (pain) {
    const cH = 22 + Math.ceil(pain.length / 95) * 14 + 12;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, cH).fill(C.surface);
    doc.rect(MARGIN, y, 3, cH).fill(C.lime);
    doc.font('Helvetica').fontSize(8).fillColor('#9b9a95').text('CEO SIGNAL — WHAT YOUR LINKEDIN ACTIVITY REVEALS', MARGIN + 14, y + 10, { characterSpacing: 0.8 });
    doc.font('Helvetica').fontSize(10).fillColor(C.text).text(truncate(pain, 300), MARGIN + 14, y + 23, { width: PAGE_W - MARGIN * 2 - 28, lineGap: 2 });
    y += cH + 16;
  }

  // Table header
  const cols = [MARGIN, MARGIN + 90, MARGIN + 275, MARGIN + 460];
  const colW  = [84, 180, 180, 66];
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 26).fill(C.black);
  ['PILLAR', 'CURRENT STATE', 'STRATEGIC GAP', 'PRIORITY'].forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.lime).text(h, cols[i] + 8, y + 8, { width: colW[i] - 10, characterSpacing: 0.8 });
  });
  y += 26;

  buildPillarRows(pillars, pocStrategic).forEach((row, idx) => {
    const rH = Math.max(Math.ceil(row.current.length / 30) * 13 + 22, Math.ceil(row.gap.length / 30) * 13 + 22, 36);
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, rH).fill(idx % 2 === 1 ? C.surface : C.white);
    doc.rect(MARGIN, y + rH - 0.5, PAGE_W - MARGIN * 2, 0.5).fill(C.border);

    const ty = y + 10;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.text).text(row.name, cols[0] + 8, ty, { width: colW[0] - 14 });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(truncate(row.current, 150), cols[1] + 8, ty, { width: colW[1] - 16, lineGap: 2 });
    doc.font('Helvetica').fontSize(9.5).fillColor(C.text).text(truncate(row.gap, 150), cols[2] + 8, ty, { width: colW[2] - 16, lineGap: 2 });

    const b = row.priority;
    doc.rect(cols[3] + 4, ty - 1, 58, 18).fill(b.bg);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(b.color).text(b.label, cols[3] + 4, ty + 4, { width: 58, align: 'center' });
    y += rH;
  });
}

// ── PAGE 3: ROADMAP ───────────────────────────────────────────
function drawRoadmapPage(doc, data) {
  const { company, pillars, pocStrategic } = data;
  drawPageHeader(doc, 'Section 02 — 90-Day Action Roadmap');
  let y = 100;

  doc.font('Helvetica-Bold').fontSize(24).fillColor(C.text).text('90 days to a', MARGIN, y);
  doc.font('Helvetica-BoldOblique').fontSize(24).fillColor(C.text).text('measurable growth system', MARGIN, y + 30);
  y += 74;

  doc.font('Helvetica').fontSize(10.5).fillColor(C.muted)
     .text(`Three phases, sequenced by leverage. Each action is chosen based on the specific gaps identified for ${company}.`, MARGIN, y, { width: PAGE_W - MARGIN * 2, lineGap: 2 });
  y += 32;

  const phases = buildRoadmap(pillars, pocStrategic);
  const cardW = (PAGE_W - MARGIN * 2 - 16) / 3;
  const dayRanges = ['Days 1–30', 'Days 31–60', 'Days 61–90'];

  phases.forEach((phase, i) => {
    const x = MARGIN + i * (cardW + 8);
    doc.rect(x, y, cardW, 0.5).fill(C.border);
    doc.rect(x, y, 0.5, 200).fill(C.border);
    doc.rect(x + cardW, y, 0.5, 200).fill(C.border);
    doc.rect(x, y + 200, cardW, 0.5).fill(C.border);

    doc.rect(x, y, cardW, 42).fill(C.black);
    doc.font('Helvetica').fontSize(8).fillColor('#5e5d59').text(dayRanges[i], x + 10, y + 8, { characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.offwhite).text(phase.title, x + 10, y + 21, { width: cardW - 20 });

    let iy = y + 52;
    phase.items.forEach(item => {
      doc.circle(x + 16, iy + 5, 2.5).fill(C.lime);
      doc.font('Helvetica').fontSize(9).fillColor(C.text).text(item, x + 26, iy, { width: cardW - 36, lineGap: 1.5 });
      iy = doc.y + 8;
    });
  });

  y += 216;

  const cH = 70;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, cH).fill(C.surface);
  doc.rect(MARGIN, y, 3, cH).fill(C.lime);
  doc.font('Helvetica').fontSize(8).fillColor('#9b9a95').text('HOW OMEGA PRAXIS ACCELERATES THIS', MARGIN + 14, y + 10, { characterSpacing: 0.8 });
  doc.font('Helvetica').fontSize(10).fillColor(C.text)
     .text('The platform generates AI-powered strategies across all four pillars, produces ready-to-use content, and tracks roadmap execution — so you move from analysis to implementation in days, not weeks. Strategic guidance sessions are available to pressure-test decisions at each phase gate.', MARGIN + 14, y + 24, { width: PAGE_W - MARGIN * 2 - 28, lineGap: 2 });
}

// ── PAGE 4: CTA ───────────────────────────────────────────────
function drawCtaPage(doc, company) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.black);
  doc.rect(0, 0, 4, PAGE_H).fill(C.lime);

  let y = 100;
  doc.font('Helvetica').fontSize(9).fillColor(C.lime).text('SECTION 03 — HOW WE WORK TOGETHER', MARGIN, y, { characterSpacing: 1.2 });
  y += 28;
  doc.font('Helvetica-Bold').fontSize(34).fillColor(C.offwhite).text('The next step?', MARGIN, y);
  y += 44;
  doc.font('Helvetica-BoldOblique').fontSize(34).fillColor(C.offwhite).text('A 30-minute conversation.', MARGIN, y);
  y += 58;
  doc.font('Helvetica').fontSize(12).fillColor('#9b9a95')
     .text('Omega Praxis replaces the €10K–€50K strategy consultant with an AI-powered growth system built specifically for scaling SMBs. The consulting relationship always comes first — the platform is your execution engine.', MARGIN, y, { width: 420, lineGap: 4 });
  y += 78;

  const services = [
    { name: 'Kickstart Session', price: '€175 · 60 min', desc: 'Map your biggest growth lever and leave with a prioritised action plan.' },
    { name: 'Strategy Session',  price: '€300 · 90 min', desc: 'Deep dive across all four pillars with a 90-day blueprint.' },
    { name: 'Monthly Review',    price: '€225 · 60 min', desc: 'Ongoing strategic accountability and course correction.' },
    { name: 'Platform Access',   price: 'From €990/yr',  desc: 'AI growth tools, 90-day roadmaps, content engine across all four pillars.' },
  ];

  const cw = (PAGE_W - MARGIN * 2 - 12) / 2;
  services.forEach((s, i) => {
    const x = MARGIN + (i % 2) * (cw + 12);
    const sy = y + Math.floor(i / 2) * 86;
    doc.rect(x, sy, cw, 80).stroke('#2a2a2c');
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.offwhite).text(s.name, x + 14, sy + 12);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.lime).text(s.price, x + 14, sy + 27);
    doc.font('Helvetica').fontSize(9).fillColor('#5e5d59').text(s.desc, x + 14, sy + 42, { width: cw - 24, lineGap: 1.5 });
  });

  y += 192;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.lime).text('omegapraxis.com/strategic-guidance →', MARGIN, y);

  doc.rect(MARGIN, PAGE_H - 80, PAGE_W - MARGIN * 2, 0.5).fill('#2a2a2c');
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.offwhite).text('Gianni Candido', MARGIN, PAGE_H - 62);
  doc.font('Helvetica').fontSize(10).fillColor('#9b9a95').text('Founder, Omega Praxis · contact@omegapraxis.com', MARGIN, PAGE_H - 46);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.lime).text('Omega·Praxis', PAGE_W - MARGIN - 110, PAGE_H - 56);
}

// ── SHARED HELPERS ────────────────────────────────────────────
function drawPageHeader(doc, label) {
  doc.rect(0, 0, PAGE_W, 68).fill(C.white);
  doc.rect(0, 67.5, PAGE_W, 0.5).fill(C.border);
  doc.font('Helvetica').fontSize(8).fillColor('#9b9a95').text(label.toUpperCase(), MARGIN, 30, { characterSpacing: 0.6 });
  doc.rect(PAGE_W - MARGIN - 34, 22, 28, 22).fill(C.black);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.lime).text('OP', PAGE_W - MARGIN - 27, 28);
}

function buildPillarRows(pillars, pocStrategic) {
  return [
    { name: 'Branding',     current: pillars.branding.vp || pillars.branding.clarity || extractSentence(pocStrategic, 'brand') || 'See research notes',     gap: pillars.branding.gap     || 'Requires positioning audit',       priority: badgeFor(pillars.branding.gap) },
    { name: 'Marketing',    current: pillars.marketing.content || extractSentence(pocStrategic, 'marketing') || 'See research notes',                          gap: pillars.marketing.gap    || 'Content engine not established',   priority: badgeFor(pillars.marketing.gap) },
    { name: 'Sales',        current: pillars.sales.funnel || pillars.sales.proof || extractSentence(pocStrategic, 'sales') || 'See research notes',            gap: pillars.sales.gap        || 'Funnel visibility gap',            priority: badgeFor(pillars.sales.gap) },
    { name: 'Partnerships', current: pillars.partnerships.existing || 'See research notes',                                                                    gap: pillars.partnerships.gap || 'No formal partner programme',      priority: badgeFor(pillars.partnerships.gap) },
  ];
}

function buildRoadmap(pillars, pocStrategic) {
  const gaps = [pillars.branding.gap, pillars.marketing.gap, pillars.sales.gap, pillars.partnerships.gap].filter(g => g && !g.includes('N/A'));
  return [
    { title: 'Positioning foundation', items: [gaps[0] ? truncate(gaps[0], 58) : 'Clarify value proposition for ICP', 'Audit homepage messaging vs buyer language', 'Define 3 core differentiators with evidence'] },
    { title: 'Pipeline activation',    items: [gaps[1] ? truncate(gaps[1], 58) : 'Activate LinkedIn thought leadership', 'Set up email nurture for top-of-funnel', 'Instrument conversion tracking on key pages'] },
    { title: 'Revenue acceleration',   items: [gaps[2] ? truncate(gaps[2], 58) : 'Build metrics-backed social proof', gaps[3] ? truncate(gaps[3], 58) : 'Identify 3 co-sell partnership targets', 'Review pricing presentation and ROI framing'] },
  ];
}

function badgeFor(gap) {
  if (!gap || gap.includes('N/A')) return { label: 'Monitor',  bg: C.green,  color: C.greenText };
  const l = gap.toLowerCase();
  if (l.includes('no ') || l.includes('missing') || l.includes('none') || l.includes('no clear'))
    return { label: 'Critical', bg: C.red, color: C.redText };
  return { label: 'High', bg: C.amber, color: C.amberText };
}

function extractPainSummary(ceoPainPoints, linkedinSummary) {
  if (linkedinSummary && linkedinSummary.length > 50 && !linkedinSummary.startsWith('N/A')) return truncate(linkedinSummary, 280);
  if (ceoPainPoints && !ceoPainPoints.startsWith('N/A')) return truncate(ceoPainPoints, 280);
  return '';
}

function extractSentence(text, keyword) {
  if (!text) return '';
  const s = text.split(/[.\n]/).find(s => s.toLowerCase().includes(keyword));
  return s ? s.trim() : '';
}

function truncate(str, max) {
  if (!str) return '';
  str = str.trim();
  return str.length <= max ? str : str.slice(0, max - 1) + '…';
}
