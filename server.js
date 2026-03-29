import express from 'express';
import puppeteer from 'puppeteer';
import nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import { generateBriefHtml } from './briefTemplate.js';
import { parseClayFields } from './parseFields.js';
import 'dotenv/config';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Health check ──────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'Omega Praxis webhook live' }));

// ── Main webhook ──────────────────────────────────────────────
app.post('/growth-report', async (req, res) => {
  // Clay can send data as query params OR body — handle both
  const raw = { ...req.query, ...req.body };

  console.log('▶ Incoming request from Clay:', JSON.stringify(raw, null, 2));

  // 1. Parse & validate
  const data = parseClayFields(raw);
  if (!data.email) {
    console.error('✗ Missing email — skipping');
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    // 2. Generate email copy via Claude
    console.log(`◆ Generating email copy for ${data.ceoName} / ${data.company}...`);
    const emailCopy = await generateEmailCopy(data);

    // 3. Render PDF
    console.log('◆ Rendering PDF brief...');
    const pdfBuffer = await renderPdf(data);

    // 4. Send email
    console.log(`◆ Sending email to ${data.email}...`);
    await sendEmail(data, emailCopy, pdfBuffer);

    console.log(`✓ Done — brief sent to ${data.email}`);
    res.json({ success: true, recipient: data.email, company: data.company });

  } catch (err) {
    console.error('✗ Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Claude: generate tailored email copy ─────────────────────
async function generateEmailCopy(data) {
  const prompt = `You are Gianni Candido, founder of Omega Praxis. Write a short, direct outreach email to ${data.ceoName}, CEO of ${data.company}.

Context about this CEO:
- LinkedIn activity: ${data.linkedinSummary || 'Not available'}
- Key pain points: ${data.ceoPainPoints || 'Not available'}
- Founder challenges: ${data.founderChallenges || 'Not available'}
- Company strategic gaps: ${data.pocStrategic || 'Not available'}

Rules:
- Founder-to-founder tone. Never corporate, never flattering without basis.
- 3 short paragraphs max. No filler. No "I hope this email finds you well."
- Paragraph 1: One specific observation about their current growth challenge (from the data above — be precise, name something real).
- Paragraph 2: One sentence on what the attached brief contains and why it's relevant to them specifically.
- Paragraph 3: Single CTA — "The next step? A 30-minute conversation." with a link to https://omegapraxis.com/strategic-guidance
- Sign off as: Gianni Candido / Founder, Omega Praxis
- Return ONLY the email body text. No subject line. No HTML. Plain text with line breaks.`;

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  return msg.content[0].text;
}

// ── Puppeteer: render HTML → PDF ──────────────────────────────
async function renderPdf(data) {
  const html = generateBriefHtml(data);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

// ── Nodemailer: send email with PDF attachment ────────────────
async function sendEmail(data, emailBody, pdfBuffer) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const subject = `Growth brief for ${data.company} — Omega Praxis`;
  const filename = `Omega-Praxis-Brief-${data.company.replace(/[^a-z0-9]/gi, '-')}.pdf`;

  await transporter.sendMail({
    from: `"Gianni Candido | Omega Praxis" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    replyTo: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: data.email,
    subject,
    text: emailBody,
    attachments: [{
      filename,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Omega Praxis webhook listening on port ${PORT}`));
