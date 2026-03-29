/**
 * firestore.js
 * Lightweight Firestore REST API wrapper — no Firebase Admin SDK needed.
 * Uses the Firestore REST API directly so Railway doesn't need extra dependencies.
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'devgurucatdb';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ── Auth token via Google service account ─────────────────────
let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;

  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  // Build JWT
  const header  = { alg: 'RS256', typ: 'JWT' };
  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore'
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;

  // Sign with private key using Node crypto
  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  // Exchange JWT for access token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt
    })
  });

  const data = await res.json();
  if (!data.access_token) throw new Error(`Auth failed: ${JSON.stringify(data)}`);

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  return cachedToken;
}

// ── Firestore value serialisation ─────────────────────────────
function toFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string')  fields[k] = { stringValue: v };
    else if (typeof v === 'number')  fields[k] = { integerValue: String(Math.round(v)) };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (v instanceof Date)      fields[k] = { timestampValue: v.toISOString() };
    else if (typeof v === 'object')  fields[k] = { stringValue: JSON.stringify(v) };
  }
  return { fields };
}

function fromFirestore(doc) {
  if (!doc.fields) return null;
  const obj = { id: doc.name?.split('/').pop() };
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue  !== undefined) obj[k] = v.stringValue;
    else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
    else if (v.doubleValue  !== undefined) obj[k] = parseFloat(v.doubleValue);
    else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
    else if (v.timestampValue !== undefined) obj[k] = v.timestampValue;
    else if (v.nullValue !== undefined) obj[k] = null;
  }
  return obj;
}

// ── CRUD helpers ──────────────────────────────────────────────

export async function firestoreSet(collection, docId, data) {
  const token = await getAccessToken();
  const url   = `${BASE_URL}/${collection}/${docId}`;
  const res   = await fetch(url, {
    method:  'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(toFirestore(data))
  });
  if (!res.ok) throw new Error(`Firestore SET failed: ${await res.text()}`);
  return await res.json();
}

export async function firestoreGet(collection, docId) {
  const token = await getAccessToken();
  const url   = `${BASE_URL}/${collection}/${docId}`;
  const res   = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET failed: ${await res.text()}`);
  const doc = await res.json();
  return fromFirestore(doc);
}

export async function firestoreList(collection) {
  const token = await getAccessToken();
  const url   = `${BASE_URL}/${collection}?pageSize=500`;
  const res   = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Firestore LIST failed: ${await res.text()}`);
  const data = await res.json();
  if (!data.documents) return [];
  return data.documents.map(fromFirestore).filter(Boolean);
}

export async function firestoreUpdate(collection, docId, fields) {
  const token      = await getAccessToken();
  const fieldPaths = Object.keys(fields).join(',');
  const url        = `${BASE_URL}/${collection}/${docId}?updateMask.fieldPaths=${fieldPaths}`;
  const res        = await fetch(url, {
    method:  'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(toFirestore(fields))
  });
  if (!res.ok) throw new Error(`Firestore UPDATE failed: ${await res.text()}`);
  return await res.json();
}

export async function firestoreDelete(collection, docId) {
  const token = await getAccessToken();
  const url   = `${BASE_URL}/${collection}/${docId}`;
  const res   = await fetch(url, {
    method:  'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Firestore DELETE failed: ${await res.text()}`);
  return true;
}
