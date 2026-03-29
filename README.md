# Omega Praxis — Growth Brief Webhook

Clay → Claude API → PDF Brief → Email

## What it does

1. Clay POSTs lead data to `/growth-report`
2. Claude generates a tailored email opening based on CEO pain points
3. Puppeteer renders a branded 4-page PDF brief
4. Nodemailer sends the email with the PDF attached
5. Returns `{ success: true }` to Clay

---

## Deploy to Railway in 5 minutes

### Step 1 — Push to GitHub

```bash
cd omega-webhook
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/omega-webhook.git
git push -u origin main
```

### Step 2 — Create Railway project

1. Go to [railway.app](https://railway.app) → New Project
2. Choose **Deploy from GitHub repo**
3. Select your `omega-webhook` repo
4. Railway auto-detects Node.js and starts building

### Step 3 — Add environment variables

In Railway → your service → **Variables**, add:

| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SMTP_HOST` | your SMTP host |
| `SMTP_PORT` | `587` (or `465` for SSL) |
| `SMTP_SECURE` | `false` (or `true` for port 465) |
| `SMTP_USER` | `contact@omegapraxis.com` |
| `SMTP_PASS` | your SMTP password |
| `SMTP_FROM` | `contact@omegapraxis.com` |

> Railway auto-sets PORT — don't add it manually.

### Step 4 — Get your public URL

Railway → your service → **Settings** → **Domains** → Generate domain.
You'll get something like: `https://omega-webhook-production.up.railway.app`

### Step 5 — Configure Clay

In Clay, add an HTTP Request action (or use a Webhook column) with:

- **Method:** POST
- **URL:** `https://your-railway-url.up.railway.app/growth-report`
- **Body type:** JSON or Form
- **Fields to map:**

```json
{
  "company":            "{{company}}",
  "email":              "{{ceo_email}}",
  "poc_brief":          "{{poc_brief}}",
  "poc_strategic":      "{{poc_strategic}}",
  "ceo_pain_points":    "{{ceo_pain_points}}",
  "linkedin_summary":   "{{linkedin_summary}}",
  "founder_challenges": "{{founder_challenges}}"
}
```

---

## Test locally

```bash
cp .env.example .env
# Fill in your actual values in .env

npm install
npm start

# In another terminal:
curl -X POST http://localhost:3000/growth-report \
  -H "Content-Type: application/json" \
  -d '{
    "company": "Acme Corp",
    "email": "test@youremail.com",
    "poc_brief": "COMPANY: Acme Corp\nDOMAIN: acme.com\nCEO NAME: John Smith\nCEO LINKEDIN: https://linkedin.com/in/johnsmith",
    "poc_strategic": "Branding_VP: SaaS billing platform\nBranding_gap: No clear differentiation from competitors\nMarketing_content: No blog or content engine\nMarketing_gap: No thought leadership presence\nSales_funnel: Self-serve only\nSales_gap: No enterprise sales motion\nPartnerships_existing: None\nPartnership_gap: Missing obvious integration partners",
    "ceo_pain_points": "Topic: scaling revenue\nRelevance: High",
    "linkedin_summary": "John posts regularly about the challenges of scaling a SaaS company from $1M to $5M ARR, frequently mentioning GTM execution and hiring.",
    "founder_challenges": "N/A"
  }'
```

---

## Clay field mapping reference

The webhook accepts these field names (case-insensitive):

| Clay column | Webhook field |
|-------------|---------------|
| Company name | `company` |
| CEO email | `email` or `ceo_email` |
| POC Brief (Claygent) | `poc_brief` |
| POC Strategic (Claygent) | `poc_strategic` |
| CEO Pain Points | `ceo_pain_points` |
| LinkedIn Summary | `linkedin_summary` |
| Founder Challenges | `founder_challenges` |

The parser also extracts CEO name and LinkedIn URL from `poc_brief` automatically if not sent as separate fields.

---

## SMTP provider quick configs

**Brevo (recommended — free 300/day)**
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
```

**Gmail / Google Workspace**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
# Use an App Password, not your main password
```

**OVH**
```
SMTP_HOST=ssl0.ovh.net
SMTP_PORT=465
SMTP_SECURE=true
```

**Mailgun**
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
```

---

## File structure

```
omega-webhook/
├── server.js          # Express server + main orchestration
├── parseFields.js     # Clay field normalisation
├── briefTemplate.js   # HTML → PDF template (Omega Praxis brand)
├── package.json
├── Procfile           # Railway start command
├── .env.example       # Copy to .env and fill in values
└── .gitignore
```
