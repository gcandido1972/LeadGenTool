import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { generateBriefPdf } from './briefTemplate.js';
import { parseClayFields } from './parseFields.js';
import { firestoreSet, firestoreList, firestoreUpdate, firestoreDelete } from './firestore.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app       = express();

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true, limit: '4mb' }));

const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TEST_MODE  = process.env.TEST_MODE === 'true';
const TEST_EMAIL = process.env.TEST_EMAIL || 'gianni@candido.org';

if (TEST_MODE) console.log(`⚠️  TEST MODE ON — all emails → ${TEST_EMAIL}`);

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status:   'Omega Praxis webhook live',
  version:  '3.0',
  testMode: TEST_MODE,
  db:       'Firestore — devgurucatdb'
}));

// ── Dashboard ─────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  try {
    const html = readFileSync(join(__dirname, 'dashboard.html'), 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch {
    res.status(404).send('dashboard.html not found.');
  }
});

// ══════════════════════════════════════════════════════════════
// FIRESTORE API — called by the dashboard
// ══════════════════════════════════════════════════════════════

// GET /leads — list all leads
app.get('/leads', async (req, res) => {
  try {
    const leads = await firestoreList('leads');
    // Sort by createdAt desc
    leads.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json(leads);
  } catch (err) {
    console.error('✗ GET /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /leads — save a batch of leads from CSV import
app.post('/leads', async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length)
    return res.status(400).json({ error: 'leads array required' });

  try {
    const saved = [];
    for (const lead of leads) {
      const id = lead.id || randomId();
      const doc = {
        ...lead,
        id,
        createdAt: lead.createdAt || new Date().toISOString(),
        status:    lead.status || 'pending'
      };
      await firestoreSet('leads', id, doc);
      saved.push(id);
    }
    console.log(`✓ Saved ${saved.length} leads to Firestore`);
    res.json({ saved: saved.length });
  } catch (err) {
    console.error('✗ POST /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /leads/:id — update lead status / fields
app.patch('/leads/:id', async (req, res) => {
  try {
    await firestoreUpdate('leads', req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ PATCH /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /leads/:id — remove a lead
app.delete('/leads/:id', async (req, res) => {
  try {
    await firestoreDelete('leads', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ DELETE /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /leads — clear ALL leads
app.delete('/leads', async (req, res) => {
  try {
    const leads = await firestoreList('leads');
    for (const l of leads) await firestoreDelete('leads', l.id);
    console.log(`✓ Cleared ${leads.length} leads from Firestore`);
    res.json({ deleted: leads.length });
  } catch (err) {
    console.error('✗ DELETE /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// MAIN WEBHOOK — Clay POSTs here
// ══════════════════════════════════════════════════════════════
app.post('/growth-report', async (req, res) => {
  const raw  = { ...req.query, ...req.body };
  console.log('▶ Incoming from Clay:', JSON.stringify(raw, null, 2));

  const data = parseClayFields(raw);
  if (!data.email) {
    console.error('✗ Missing email');
    return res.status(400).json({ error: 'email is required' });
  }

  const isTest         = TEST_MODE || raw._testOverride === true || raw._testOverride === 'true';
  const recipientEmail = isTest ? TEST_EMAIL : data.email;
  const testPrefix     = isTest ? '[TEST] ' : '';

  try {
    // Use edited email from preview modal if provided, otherwise generate fresh
    let emailCopy;
    if (raw._previewBody && raw._previewBody.trim().length > 20) {
      emailCopy = raw._previewBody;
      console.log(`◆ Step 1/3 — Using edited email from preview modal`);
    } else {
      console.log(`◆ Step 1/3 — Generating email copy for ${data.ceoName} / ${data.company}...`);
      emailCopy = await generateEmailCopy(data);
      console.log('✓ Email copy done');
    }

    console.log('◆ Step 2/3 — Generating PDF...');
    const pdfBuffer = await generateBriefPdf(data);
    console.log(`✓ PDF done — ${pdfBuffer.length} bytes`);

    console.log(`◆ Step 3/3 — Sending to ${recipientEmail} via Resend...`);
    await sendEmail(data, emailCopy, pdfBuffer, recipientEmail, testPrefix);
    console.log('✓ Sent');

    // Log the send to Firestore
    const leadId = raw.leadId || randomId();
    try {
      await firestoreUpdate('leads', leadId, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentTo: recipientEmail
      });
      console.log(`✓ Firestore updated — lead ${leadId} → sent`);
    } catch (e) {
      console.warn('⚠ Firestore update skipped (lead may not exist):', e.message);
    }

    res.json({
      success:       true,
      recipient:     recipientEmail,
      originalEmail: data.email,
      company:       data.company,
      testMode:      isTest
    });

  } catch (err) {
    console.error('✗ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /test endpoint ────────────────────────────────────────────
app.get('/test', async (req, res) => {
  console.log('▶ Manual test triggered');
  const data = parseClayFields({
    company:            'Cacheflow (Acquired by HubSpot)',
    email:              'test-lead@example.com',
    poc_brief:          'COMPANY: Cacheflow\nDOMAIN: getcacheflow.com\nCEO NAME: John Gengarella\nCEO LINKEDIN: https://linkedin.com/in/johngengarella',
    poc_strategic:      'Branding_VP: Integrated CPQ billing platform for SaaS\nBranding_clarity: Generic\nBranding_gap: No clear customer-facing value proposition\nMarketing_content: LinkedIn only\nMarketing_gap: No blog or case studies\nSales_funnel: Self-serve\nSales_gap: No enterprise sales motion\nPartnerships_existing: None\nPartnership_gap: Missing HubSpot ecosystem integrations',
    ceo_pain_points:    'Topic: scaling revenue post-acquisition\nRelevance: High',
    linkedin_summary:   'John posts regularly about enterprise AI and startup scaling.',
    founder_challenges: 'Scaling GTM post-acquisition'
  });

  try {
    console.log('◆ Step 1/3 — Email copy...');
    const emailCopy = await generateEmailCopy(data);
    console.log('◆ Step 2/3 — PDF...');
    const pdfBuffer = await generateBriefPdf(data);
    console.log('◆ Step 3/3 — Sending...');
    await sendEmail(data, emailCopy, pdfBuffer, TEST_EMAIL, '[TEST] ');
    console.log('✓ Test done');
    res.json({ success: true, recipient: TEST_EMAIL, pdfBytes: pdfBuffer.length, emailPreview: emailCopy });
  } catch (err) {
    console.error('✗ Test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /preview-email — generate email copy without sending ────
app.post('/preview-email', async (req, res) => {
  const raw  = { ...req.query, ...req.body };
  const data = parseClayFields(raw);
  try {
    const emailCopy = await generateEmailCopy(data);
    res.json({ success: true, emailCopy, company: data.company, ceoName: data.ceoName });
  } catch (err) {
    console.error('✗ Preview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Claude: email copy ────────────────────────────────────────
async function generateEmailCopy(data) {
  const msg = await anthropic.messages.create({
    model:      'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{
      role:    'user',
      content: `You are Gianni Candido, founder of Omega Praxis. Write a short outreach email to ${data.ceoName}, CEO of ${data.company}.

Context from research:
- LinkedIn activity: ${data.linkedinSummary || 'Not available'}
- CEO pain points: ${data.ceoPainPoints || 'Not available'}
- Founder challenges: ${data.founderChallenges || 'Not available'}
- Strategic gaps found: ${data.pocStrategic || 'Not available'}

Rules:
- Founder-to-founder tone. Direct, no filler, no corporate pleasantries.
- 3 short paragraphs only.
- Para 1: One specific observation about their current growth challenge — name something precise from the data.
- Para 2: One sentence on what the attached brief contains and why it is relevant to them specifically.
- Para 3: CTA — "The next step? A 30-minute conversation." with link https://tidycal.com/gianni3/discovery-call
- Sign off: Gianni Candido / Founder, Omega Praxis
- Return ONLY the email body. No subject line. No HTML. Plain text with line breaks.`
    }]
  });
  return msg.content[0].text;
}

// ── Resend HTTP API ───────────────────────────────────────────
async function sendEmail(data, emailBody, pdfBuffer, recipientEmail, subjectPrefix = '') {
  const apiKey  = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  const from     = process.env.SMTP_FROM || 'contact@omegapraxis.com';
  const filename = `Omega-Praxis-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}.pdf`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:        `Gianni Candido | Omega Praxis <${from}>`,
      to:          [recipientEmail],
      reply_to:    from,
      subject:     `${subjectPrefix}Growth brief for ${data.company} — Omega Praxis`,
      text:        emailBody,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }]
    })
  });

  const result = await res.json();
  if (!res.ok) throw new Error(`Resend error: ${result.message || JSON.stringify(result)}`);
  console.log(`   → Resend: ${JSON.stringify(result)}`);
  return result;
}

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Omega Praxis webhook on port ${PORT}`));
