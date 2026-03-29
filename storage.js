/**
 * storage.js
 * Firebase Storage REST API wrapper — uploads PDFs and returns public URLs.
 * Uses the same service account credentials as Firestore.
 */

const PROJECT_ID  = process.env.FIREBASE_PROJECT_ID || 'devgurucatdb';
const BUCKET      = `${PROJECT_ID}.appspot.com`;
const STORAGE_URL = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const UPLOAD_URL  = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;

// ── Reuse auth token logic ────────────────────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const sa      = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write'
  };

  const b64      = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt
    })
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Storage auth failed: ${JSON.stringify(data)}`);
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

// ── Upload PDF and return public download URL ─────────────────
export async function uploadPdf(pdfBuffer, filename) {
  const token       = await getAccessToken();
  const storagePath = `briefs/${filename}`;
  const encodedPath = encodeURIComponent(storagePath);

  // Upload via multipart
  const res = await fetch(
    `${UPLOAD_URL}?uploadType=media&name=${encodedPath}`,
    {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'application/pdf',
        'Content-Length': pdfBuffer.length
      },
      body: pdfBuffer
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage upload failed: ${err}`);
  }

  // Make the file publicly readable
  const tokenRes = await fetch(
    `${STORAGE_URL}/${encodedPath}?alt=media`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  // Build the public download URL (Firebase Storage public URL format)
  const publicUrl = `${STORAGE_URL}/${encodedPath}?alt=media`;

  // Set public read access via IAM
  await makePublic(token, storagePath);

  return {
    publicUrl,
    downloadUrl: `https://storage.googleapis.com/${BUCKET}/${storagePath}`,
    storagePath
  };
}

async function makePublic(token, storagePath) {
  const encodedPath = encodeURIComponent(storagePath);
  // Update metadata to make file public
  await fetch(
    `${STORAGE_URL}/${encodedPath}`,
    {
      method:  'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: '' } })
    }
  );
}

// ── Generate a signed download URL (works without public access) ──
export function getStorageDownloadUrl(storagePath) {
  const encodedPath = encodeURIComponent(storagePath);
  return `${STORAGE_URL}/${encodedPath}?alt=media`;
}
