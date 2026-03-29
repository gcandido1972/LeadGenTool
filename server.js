import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { generateBriefPdf } from './briefTemplate.js';
import { parseClayFields } from './parseFields.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── TEST MODE ─────────────────────────────────────────────────
const TEST_MODE  = process.env.TEST_MODE === 'true';
const TEST_EMAIL = process.env.TEST_EMAIL || 'gianni@candido.org';

if (TEST_MODE) console.log(`⚠️  TEST MODE ON — all emails → ${TEST_EMAIL}`);

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status:    'Omega Praxis webhook live',
  version:   '2.2',
  testMode:  TEST_MODE,
  testEmail: TEST_MODE ? TEST_EMAIL : null
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

// ── Main webhook — Clay POSTs here ────────────────────────────
app.post('/growth-report', async (req, res) => {
  const raw = { ...req.query, ...req.body };
  console.log('▶ Incoming from Clay:', JSON.stringify(raw, null, 2));

  const data = parseClayFields(raw);
  if (!data.email) {
    console.error('✗ Missing email');
    return res.status(400).json({ error: 'email is required' });
  }

  const recipientEmail = TEST_MODE ? TEST_EMAIL : data.email;
  const testPrefix     = TEST_MODE ? '[TEST] ' : '';

  try {
    console.log(`◆ Step 1/3 — Generating email copy for ${data.ceoName} / ${data.company}...`);
    const emailCopy = await generateEmailCopy(data);
    console.log('✓ Email copy generated');

    console.log('◆ Step 2/3 — Generating PDF brief...');
    const pdfBuffer = await generateBriefPdf(data);
    console.log(`✓ PDF generated — ${pdfBuffer.length} bytes`);

    console.log(`◆ Step 3/3 — Sending via Resend API to ${recipientEmail}...`);
    await sendEmail(data, emailCopy, pdfBuffer, recipientEmail, testPrefix);
    console.log('✓ Email sent successfully');

    res.json({
      success:       true,
      recipient:     recipientEmail,
      originalEmail: data.email,
      company:       data.company,
      testMode:      TEST_MODE
    });

  } catch (err) {
    console.error('✗ Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /test — fire full pipeline with sample data ───────────────
app.get('/test', async (req, res) => {
  console.log('▶ Manual test triggered');

  const data = parseClayFields({
    company:            'Cacheflow (Acquired by HubSpot)',
    email:              'test-lead@example.com',
    poc_brief:          'COMPANY: Cacheflow\nDOMAIN: getcacheflow.com\nCEO NAME: John Gengarella\nCEO LINKEDIN: https://linkedin.com/in/johngengarella',
    poc_strategic:      'Branding_VP: Integrated CPQ billing platform for SaaS\nBranding_clarity: Generic\nBranding_gap: No clear customer-facing value proposition\nMarketing_content: LinkedIn presence only\nMarketing_gap: No blog, newsletter or case studies\nSales_funnel: Self-serve\nSales_gap: No enterprise sales motion visible\nPartnerships_existing: None confirmed\nPartnership_gap: Missing obvious HubSpot ecosystem integrations',
    ceo_pain_points:    'Topic: scaling revenue post-acquisition\nRelevance: High',
    linkedin_summary:   'John posts regularly about enterprise AI and the operational scaling of startups. His feed shows active involvement in product launches, hiring, and sales tax compliance challenges during rapid expansion.',
    founder_challenges: 'Scaling GTM post-acquisition, maintaining product velocity'
  });

  try {
    console.log('◆ Step 1/3 — Generating email copy...');
    const emailCopy = await generateEmailCopy(data);
    console.log('✓ Email copy done');

    console.log('◆ Step 2/3 — Generating PDF...');
    const pdfBuffer = await generateBriefPdf(data);
    console.log(`✓ PDF done — ${pdfBuffer.length} bytes`);

    console.log(`◆ Step 3/3 — Sending to ${TEST_EMAIL} via Resend API...`);
    await sendEmail(data, emailCopy, pdfBuffer, TEST_EMAIL, '[TEST] ');
    console.log('✓ Test email sent');

    res.json({
      success:      true,
      recipient:    TEST_EMAIL,
      company:      data.company,
      pdfBytes:     pdfBuffer.length,
      emailPreview: emailCopy
    });

  } catch (err) {
    console.error('✗ Test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Claude: generate email copy ───────────────────────────────
async function generateEmailCopy(data) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{
      role: 'user',
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
- Para 3: CTA — "The next step? A 30-minute conversation." with link https://omegapraxis.com/strategic-guidance
- Sign off: Gianni Candido / Founder, Omega Praxis
- Return ONLY the email body. No subject line. No HTML. Plain text with line breaks.`
    }]
  });
  return msg.content[0].text;
}

// ── Resend HTTP API — no SMTP ports needed ────────────────────
async function sendEmail(data, emailBody, pdfBuffer, recipientEmail, subjectPrefix = '') {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set in environment variables');

  const fromEmail = process.env.SMTP_FROM || 'contact@omegapraxis.com';
  const filename  = `Omega-Praxis-Growth-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}.pdf`;
  const subject   = `${subjectPrefix}Growth brief for ${data.company} — Omega Praxis`;

  // Resend requires base64-encoded attachments
  const pdfBase64 = pdfBuffer.toString('base64');

  const payload = {
    from:        `Gianni Candido | Omega Praxis <${fromEmail}>`,
    to:          [recipientEmail],
    reply_to:    fromEmail,
    subject,
    text:        emailBody,
    attachments: [{
      filename,
      content: pdfBase64
    }]
  };

  console.log(`   → Calling Resend API (to: ${recipientEmail}, subject: ${subject})`);

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await res.json();

  if (!res.ok) {
    console.error('✗ Resend API error:', JSON.stringify(result));
    throw new Error(`Resend error: ${result.message || JSON.stringify(result)}`);
  }

  console.log(`   → Resend response: ${JSON.stringify(result)}`);
  return result;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Omega Praxis webhook on port ${PORT}`));
