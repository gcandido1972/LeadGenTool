import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { generateBriefPdf } from './briefTemplate.js';
import { parseClayFields } from './parseFields.js';
import { firestoreSet, firestoreList, firestoreUpdate, firestoreDelete } from './firestore.js';
import { uploadPdf } from './storage.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app       = express();

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
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
  version:  '4.0',
  testMode: TEST_MODE,
  db:       'Firestore + Firebase Storage — devgurucatdb'
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
// FIRESTORE API
// ══════════════════════════════════════════════════════════════

app.get('/leads', async (req, res) => {
  try {
    const leads = await firestoreList('leads');
    leads.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json(leads);
  } catch (err) {
    console.error('✗ GET /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/leads', async (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length)
    return res.status(400).json({ error: 'leads array required' });
  try {
    const saved = [];
    for (const lead of leads) {
      const id  = lead.id || randomId();
      const doc = { ...lead, id, createdAt: lead.createdAt || new Date().toISOString(), status: lead.status || 'pending' };
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

app.patch('/leads/:id', async (req, res) => {
  try {
    await firestoreUpdate('leads', req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ PATCH /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/leads/:id', async (req, res) => {
  try {
    await firestoreDelete('leads', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('✗ DELETE /leads/:id:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/leads', async (req, res) => {
  try {
    const leads = await firestoreList('leads');
    for (const l of leads) await firestoreDelete('leads', l.id);
    console.log(`✓ Cleared ${leads.length} leads`);
    res.json({ deleted: leads.length });
  } catch (err) {
    console.error('✗ DELETE /leads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// PDF GENERATION + FIREBASE STORAGE UPLOAD
// Returns download URL — used by dashboard before sending
// ══════════════════════════════════════════════════════════════
app.post('/generate-pdf', async (req, res) => {
  const raw  = { ...req.query, ...req.body };
  const data = parseClayFields(raw);

  console.log(`◆ Generating PDF for ${data.company}...`);
  try {
    const pdfBuffer = await generateBriefPdf(data);
    const filename  = `Omega-Praxis-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`;

    console.log(`◆ Uploading PDF to Firebase Storage...`);
    const { downloadUrl, storagePath } = await uploadPdf(pdfBuffer, filename);
    console.log(`✓ PDF uploaded — ${downloadUrl}`);

    // Save URL to Firestore lead record if leadId provided
    if (raw.leadId) {
      try {
        await firestoreUpdate('leads', raw.leadId, { pdfUrl: downloadUrl, pdfPath: storagePath });
      } catch(e) { console.warn('Firestore PDF url update skipped:', e.message); }
    }

    res.json({ success: true, downloadUrl, storagePath, filename });
  } catch (err) {
    console.error('✗ PDF generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// EMAIL PREVIEW — generate email copy without sending
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// MAIN WEBHOOK — Clay POSTs here / dashboard sends here
// ══════════════════════════════════════════════════════════════
app.post('/growth-report', async (req, res) => {
  const raw  = { ...req.query, ...req.body };
  console.log('▶ Incoming:', raw.company, raw.email);

  const data = parseClayFields(raw);
  if (!data.email) return res.status(400).json({ error: 'email is required' });

  const isTest         = TEST_MODE || raw._testOverride === true || raw._testOverride === 'true';
  const recipientEmail = isTest ? TEST_EMAIL : data.email;
  const testPrefix     = isTest ? '[TEST] ' : '';

  try {
    // 1. Email copy — use edited version from preview modal if provided
    let emailCopy;
    if (raw._previewBody && raw._previewBody.trim().length > 20) {
      emailCopy = raw._previewBody;
      console.log('◆ Step 1/3 — Using edited email from preview');
    } else {
      console.log(`◆ Step 1/3 — Generating email copy...`);
      emailCopy = await generateEmailCopy(data);
    }
    console.log('✓ Email copy ready');

    // 2. PDF — use already-generated URL if available, otherwise generate fresh
    let pdfUrl = raw._pdfUrl || null;
    let pdfBuffer = null;

    if (!pdfUrl) {
      console.log('◆ Step 2/3 — Generating + uploading PDF...');
      pdfBuffer = await generateBriefPdf(data);
      const filename = `Omega-Praxis-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`;
      const uploaded = await uploadPdf(pdfBuffer, filename);
      pdfUrl = uploaded.downloadUrl;
      console.log(`✓ PDF at ${pdfUrl}`);
    } else {
      console.log(`◆ Step 2/3 — Reusing existing PDF: ${pdfUrl}`);
    }

    // 3. Send email with PDF link (no attachment)
    console.log(`◆ Step 3/3 — Sending to ${recipientEmail}...`);
    await sendEmail(data, emailCopy, pdfUrl, recipientEmail, testPrefix);
    console.log('✓ Email sent');

    // Update Firestore
    const leadId = raw.leadId || randomId();
    try {
      await firestoreUpdate('leads', leadId, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentTo: recipientEmail,
        pdfUrl
      });
    } catch(e) { console.warn('⚠ Firestore update skipped:', e.message); }

    res.json({ success: true, recipient: recipientEmail, company: data.company, pdfUrl, testMode: isTest });

  } catch (err) {
    console.error('✗ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /test ──────────────────────────────────────────────────────
app.get('/test', async (req, res) => {
  console.log('▶ Manual test triggered');
  const data = parseClayFields({
    company:            'Cacheflow (Acquired by HubSpot)',
    email:              'test@example.com',
    poc_brief:          'COMPANY: Cacheflow\nDOMAIN: getcacheflow.com\nCEO NAME: John Gengarella',
    poc_strategic:      'Branding_VP: Integrated CPQ billing platform\nBranding_gap: No clear value prop\nMarketing_gap: No content engine\nSales_gap: No enterprise motion\nPartnership_gap: Missing HubSpot integrations',
    ceo_pain_points:    'Topic: scaling revenue post-acquisition\nRelevance: High',
    linkedin_summary:   'John posts about enterprise AI and startup scaling.',
    founder_challenges: 'Scaling GTM post-acquisition'
  });
  try {
    const emailCopy = await generateEmailCopy(data);
    const pdfBuffer = await generateBriefPdf(data);
    const filename  = `TEST-Brief-${Date.now()}.pdf`;
    const { downloadUrl } = await uploadPdf(pdfBuffer, filename);
    await sendEmail(data, emailCopy, downloadUrl, TEST_EMAIL, '[TEST] ');
    console.log('✓ Test done');
    res.json({ success: true, recipient: TEST_EMAIL, pdfUrl: downloadUrl, emailPreview: emailCopy });
  } catch (err) {
    console.error('✗ Test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Claude: email copy ────────────────────────────────────────
async function generateEmailCopy(data) {
  // Extract first name only
  const firstName = (data.ceoName || 'there').split(' ')[0];

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
- Start with: "Dear ${firstName},"
- Founder-to-founder tone. Formal but direct. No filler, no corporate pleasantries.
- 3 short paragraphs only.
- Para 1: One specific observation about their current growth challenge — name something precise from the data above.
- Para 2: One sentence on what the strategy brief (linked below) contains and why it is specifically relevant to them. Never use the word "attached" — the brief is shared as a download link, not an attachment.
- Para 3: "The next step? A 30-minute conversation." followed by a new line with: Book your call → https://tidycal.com/gianni3/discovery-call
- Sign off: Gianni Candido / Founder, Omega Praxis
- Return ONLY the email body. No subject line. No HTML. Plain text with line breaks.`
    }]
  });
  return msg.content[0].text;
}

// ── Resend HTTP API — HTML email with signature ──────────────
async function sendEmail(data, emailBody, pdfUrl, recipientEmail, subjectPrefix = '') {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not set');

  const from    = process.env.SMTP_FROM || 'contact@omegapraxis.com';
  const subject = `${subjectPrefix}Growth brief for ${data.company} — Omega Praxis`;

  // Convert plain text to HTML — strip the "Book your call" line since we handle it as a button
  const cleanBody = emailBody
    .replace(/Book your call.*tidycal\.com\/gianni3\/discovery-call/gi, '')
    .trim();

  const bodyHtml = cleanBody
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p style="margin:0 0 18px 0;line-height:1.7;font-size:15px;color:#1a1a1a;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="580" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

          <!-- EMAIL BODY -->
          <tr>
            <td style="padding-bottom:28px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA BLOCK — hierarchy: 1. Download brief  2. Book call -->
          <tr>
            <td style="padding-bottom:36px;">
              <table cellpadding="0" cellspacing="0" border="0">

                <!-- PRIMARY CTA: Download brief -->
                <tr>
                  <td style="padding-bottom:12px;">
                    <a href="${pdfUrl}"
                       style="display:inline-block;background:#3b82f6;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;padding:13px 28px;text-decoration:none;border-radius:4px;letter-spacing:0.02em;">
                      ↓ &nbsp;Download your strategy brief
                    </a>
                  </td>
                </tr>

                <!-- SECONDARY CTA: Book call -->
                <tr>
                  <td>
                    <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#6a6a6a;">
                      The next step? A 30-minute conversation. &nbsp;
                      <a href="https://tidycal.com/gianni3/discovery-call"
                         style="color:#2563eb;font-weight:bold;text-decoration:underline;">
                        Book your call →
                      </a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="border-top:1px solid #e0ddd8;padding-top:24px;">

              <!-- SIGNATURE -->
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <!-- Portrait -->
                  <td width="80" valign="top" style="padding-right:16px;">
                    <img src="https://firebasestorage.googleapis.com/v0/b/devgurucatdb.firebasestorage.app/o/portrait_sign_email.png?alt=media"
                         width="64" height="64"
                         alt="Gianni Candido"
                         style="border-radius:50%;width:64px;height:64px;object-fit:cover;display:block;">
                  </td>
                  <!-- Sig text -->
                  <td valign="top">
                    <p style="margin:0 0 3px 0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#1a1a1a;letter-spacing:0.08em;">
                      GIANNI CANDIDO &nbsp;|&nbsp; FOUNDER
                    </p>
                    <p style="margin:0 0 5px 0;font-family:Arial,sans-serif;font-size:11px;color:#4a4a4a;font-weight:bold;">
                      OMEGA PRAXIS — AI POWERED STRATEGIC GROWTH PLATFORM
                    </p>
                    <p style="margin:0 0 5px 0;font-family:Arial,sans-serif;font-size:11px;color:#6a6a6a;line-height:1.5;">
                      Grow Your Business &nbsp;|&nbsp; Get More Clients &nbsp;|&nbsp; Find Your Business Partners
                    </p>
                    <p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:11px;color:#4a4a4a;">
                      <a href="https://www.omegapraxis.com" style="color:#4a4a4a;text-decoration:none;">www.omegapraxis.com</a>
                      &nbsp;&nbsp;0032 (0) 485 83 05 34
                      &nbsp;&nbsp;<a href="https://www.linkedin.com/in/giannicandido" style="color:#0077b5;font-weight:bold;text-decoration:none;">LinkedIn</a>
                    </p>
                    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;">
                      <a href="https://tidycal.com/gianni3/discovery-call"
                         style="color:#ffffff;background:#1a1a1a;padding:5px 14px;text-decoration:none;font-weight:bold;font-size:11px;letter-spacing:0.06em;display:inline-block;">
                        BOOK A MEETING WITH ME
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain text fallback
  const plainText = `${emailBody}\n\nDownload your strategy brief:\n${pdfUrl}\n\n--\nGianni Candido | Founder, Omega Praxis\nwww.omegapraxis.com | 0032 (0) 485 83 05 34\nBook a call: https://tidycal.com/gianni3/discovery-call`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:     `Gianni Candido | Omega Praxis <${from}>`,
      to:       [recipientEmail],
      reply_to: from,
      subject,
      html,
      text:     plainText
    })
  });

  const result = await res.json();
  if (!res.ok) throw new Error(`Resend error: ${result.message || JSON.stringify(result)}`);
  console.log(`   → Resend: ${JSON.stringify(result)}`);
  return result;
}

function randomId() { return Math.random().toString(36).slice(2, 12); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Omega Praxis webhook on port ${PORT}`));
