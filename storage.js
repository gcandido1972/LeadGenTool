/**
 * storage.js
 * Firebase Storage REST API wrapper.
 * Supports both old (appspot.com) and new (firebasestorage.app) bucket formats.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'devgurucatdb';
const BUCKET     = process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.appspot.com`;

// API endpoints — same for both bucket formats
const UPLOAD_URL  = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o`;
const OBJECTS_URL = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`;
const PUBLIC_BASE = `https://storage.googleapis.com/${BUCKET}`;

// ── Auth ──────────────────────────────────────────────────────
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
  const jwt = `${unsigned}.${sign.sign(sa.private_key, 'base64url')}`;

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

// ── Upload PDF ────────────────────────────────────────────────
export async function uploadPdf(pdfBuffer, filename) {
  const token       = await getAccessToken();
  const storagePath = `briefs/${filename}`;
  const encodedPath = encodeURIComponent(storagePath);

  console.log(`   → Uploading to gs://${BUCKET}/${storagePath}`);

  // Upload via simple media upload
  const uploadRes = await fetch(
    `${UPLOAD_URL}?uploadType=media&name=${encodedPath}`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/pdf',
      },
      body: pdfBuffer
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Storage upload failed: ${err}`);
  }

  const uploadData = await uploadRes.json();
  console.log(`   → Upload OK: ${uploadData.name}`);

  // Make file publicly readable by patching IAM
  await setPublicRead(token, encodedPath);

  // Public download URL — works for both appspot.com and firebasestorage.app
  const downloadUrl = `${PUBLIC_BASE}/${storagePath}`;

  return { downloadUrl, storagePath };
}

// ── Make object publicly readable ─────────────────────────────
async function setPublicRead(token, encodedPath) {
  try {
    const iamRes = await fetch(
      `${OBJECTS_URL}/${encodedPath}/iam`,
      {
        method:  'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          bindings: [{
            role:    'roles/storage.objectViewer',
            members: ['allUsers']
          }]
        })
      }
    );
    if (!iamRes.ok) {
      // IAM may fail if uniform bucket-level access is off — try alternative
      const alt = await iamRes.text();
      console.warn('   ⚠ IAM patch skipped (uniform ACL may be on):', alt.slice(0, 100));
      // Try ACL approach as fallback
      await setAclPublic(token, encodedPath);
    }
  } catch(e) {
    console.warn('   ⚠ setPublicRead failed:', e.message);
  }
}

async function setAclPublic(token, encodedPath) {
  try {
    await fetch(
      `${OBJECTS_URL}/${encodedPath}/acl`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ entity: 'allUsers', role: 'READER' })
      }
    );
  } catch(e) {
    console.warn('   ⚠ ACL fallback also failed:', e.message);
  }
}
