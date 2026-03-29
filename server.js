import express from 'express';
import nodemailer from 'nodemailer';
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
// Set TEST_MODE=true in Railway Variables to redirect ALL emails
// to TEST_EMAIL instead of the actual lead. Safe to run from Clay.
const TEST_MODE  = process.env.TEST_MODE === 'true';
const TEST_EMAIL = process.env.TEST_EMAIL || 'gianni@candido.org';

if (TEST_MODE) {
  console.log(`⚠️  TEST MODE ON — all emails → ${TEST_EMAIL}`);
}

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status:    'Omega Praxis webhook live',
  version:   '2.0',
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
    res.status(404).send('dashboard.html not found in project root.');
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

  // In test mode, redirect to test inbox and flag it in the subject
  const recipientEmail = TEST_MODE ? TEST_EMAIL : data.email;
  const testPrefix     = TEST_MODE ? '[TEST] ' : '';

  try {
    console.log(`◆ Generating email copy for ${data.ceoName} / ${data.company}...`);
    const emailCopy = await generateEmailCopy(data);

    console.log('◆ Generating PDF brief...');
    const pdfBuffer = await generateBriefPdf(data);

    console.log(`◆ Sending to ${recipientEmail}${TEST_MODE ? ` (redirected from ${data.email})` : ''}...`);
    await sendEmail(data, emailCopy, pdfBuffer, recipientEmail, testPrefix);

    console.log(`✓ Done`);
    res.json({
      success:      true,
      recipient:    recipientEmail,
      originalEmail: data.email,
      company:      data.company,
      testMode:     TEST_MODE
    });

  } catch (err) {
    console.error('✗ Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── /test endpoint — fire a test with fake data, no Clay needed ──
app.get('/test', async (req, res) => {
  console.log('▶ Manual test triggered');

  const data = parseClayFields({
    company:            'Cacheflow (Acquired by HubSpot)',
    email:              'test-lead@example.com',
    poc_brief:          'COMPANY: Cacheflow\nDOMAIN: getcacheflow.com\nCEO NAME: John Gengarella\nCEO LINKEDIN: https://linkedin.com/in/johngengarella',
    poc_strategic:      'Branding_VP: Integrated CPQ billing platform for SaaS\nBranding_clarity: Generic\nBranding_gap: No clear customer-facing value proposition\nMarketing_content: LinkedIn presence only\nMarketing_gap: No blog, newsletter or case studies\nSales_funnel: Self-serve\nSales_gap: No enterprise sales motion visible\nPartnerships_existing: None confirmed\nPartnership_gap: Missing obvious HubSpot ecosystem integrations',
    ceo_pain_points:    'Topic: scaling revenue post-acquisition\nRelevance: High',
    linkedin_summary:   'John posts regularly about enterprise AI, robotics, and the operational scaling of startups. His feed shows active involvement in product launches, hiring, and sales tax compliance challenges during rapid expansion.',
    founder_challenges: 'Scaling GTM post-acquisition, maintaining product velocity'
  });

  const recipientEmail = TEST_EMAIL;

  try {
    console.log('◆ Generating email copy...');
    const emailCopy = await generateEmailCopy(data);

    console.log('◆ Generating PDF...');
    const pdfBuffer = await generateBriefPdf(data);

    console.log(`◆ Sending test email to ${recipientEmail}...`);
    await sendEmail(data, emailCopy, pdfBuffer, recipientEmail, '[TEST] ');

    console.log('✓ Test complete');
    res.json({
      success:   true,
      recipient: recipientEmail,
      company:   data.company,
      emailPreview: emailCopy
    });

  } catch (err) {
    console.error('✗ Test error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── /preview-pdf — renders PDF in browser from POST data ─────
app.post('/preview-pdf', async (req, res) => {
  const raw = { ...req.query, ...req.body };
  const data = parseClayFields(raw);
  try {
    const pdfBuffer = await generateBriefPdf(data);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Claude: email copy ────────────────────────────────────────
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

// ── Nodemailer ────────────────────────────────────────────────
async function sendEmail(data, emailBody, pdfBuffer, recipientEmail, subjectPrefix = '') {
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const filename = `Omega-Praxis-Growth-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}.pdf`;

  await transporter.sendMail({
    from:    `"Gianni Candido | Omega Praxis" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_FROM || process.env.SMTP_USER,
    to:      recipientEmail,
    subject: `${subjectPrefix}Growth brief for ${data.company} — Omega Praxis`,
    text:    emailBody,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }]
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Omega Praxis webhook on port ${PORT}`));
