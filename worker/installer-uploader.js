// ZenithURL installer uploader — Cloudflare Worker.
//
// Two ways in:
//  1) The website's admin form (signed in with Google) -> /upload, /delete.
//     Also /admin/key, which hands the publish key to the signed-in admin.
//  2) A programmatic /publish, authed by the publish key, for an AI or build
//     script to push an installer straight to the Apps page. It uploads to
//     GitHub Releases AND writes the listing itself (via a Firebase service
//     account), so no website/browser is needed.
//
// Endpoints:
//   POST /upload?name=<filename>           (admin token) body=file -> {downloadUrl,fileName,size,assetId}
//   POST /delete?assetId=<id>              (admin token)           -> {ok}
//   GET  /admin/key                        (admin token)           -> {key, publishUrl}
//   POST /publish?name=&platform=&description=&filename=  (Bearer publish key) body=file -> {ok,id,downloadUrl}
//
// Secrets to set on the Worker: GH_TOKEN (GitHub), PUBLISH_KEY (any long random
// string), SA_KEY (a Firebase service-account JSON, for writing the listing).

const OWNER = 'BarneyBoy232';
const REPO = 'ZenithURL';
const RELEASE_TAG = 'installers';
const FIREBASE_PROJECT_ID = 'zenithurl-e9909';
const ADMIN_EMAIL = 'ethan.barnacoat@gmail.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

// --- base64 helpers ---
function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToString(b64url) { return new TextDecoder().decode(b64urlToBytes(b64url)); }
function bytesToB64url(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function jsonToB64url(obj) { return bytesToB64url(new TextEncoder().encode(JSON.stringify(obj))); }

// --- Firebase ID token verification (for the admin website) ---
async function verifyAdminToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error('Token expired');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Wrong project');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Wrong issuer');
  if (payload.email !== ADMIN_EMAIL) throw new Error('Not the admin account');
  if (payload.email_verified !== true) throw new Error('Email not verified');

  const jwks = await (await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')).json();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!valid) throw new Error('Bad signature');
  return payload;
}

// --- GitHub ---
function gh(env, extra = {}) {
  return { 'Authorization': `Bearer ${env.GH_TOKEN}`, 'User-Agent': 'ZenithURL-Worker', 'Accept': 'application/vnd.github+json', ...extra };
}
async function ensureReleaseId(env) {
  let res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${RELEASE_TAG}`, { headers: gh(env) });
  if (res.ok) return (await res.json()).id;
  if (res.status !== 404) throw new Error(`Release lookup failed (${res.status})`);
  res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST', headers: gh(env),
    body: JSON.stringify({ tag_name: RELEASE_TAG, name: 'Installers', body: 'ZenithURL app installers.' }),
  });
  if (!res.ok) throw new Error(`Release create failed (${res.status})`);
  return (await res.json()).id;
}
async function uploadToGitHub(bytes, rawName, env) {
  const safe = (rawName || 'installer').replace(/[^a-zA-Z0-9._-]/g, '_');
  const assetName = `${Date.now()}-${safe}`;
  const releaseId = await ensureReleaseId(env);
  const res = await fetch(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
    { method: 'POST', headers: gh(env, { 'Content-Type': 'application/octet-stream' }), body: bytes }
  );
  if (!res.ok) throw new Error(`GitHub upload failed (${res.status}): ${await res.text()}`);
  const asset = await res.json();
  return { downloadUrl: asset.browser_download_url, fileName: asset.name, size: asset.size, assetId: asset.id };
}

// --- Service account -> Firestore write (for /publish) ---
function pemToPkcs8(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
async function getAccessToken(env) {
  const sa = JSON.parse(env.SA_KEY);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${jsonToB64url({ alg: 'RS256', typ: 'JWT' })}.${jsonToB64url({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${bytesToB64url(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  return (await res.json()).access_token;
}
async function writeAppDoc(env, id, d) {
  const token = await getAccessToken(env);
  const fields = {
    name: { stringValue: d.name },
    description: { stringValue: d.description || '' },
    platform: { stringValue: d.platform || 'Other' },
    status: { stringValue: 'finished' },
    fileUrl: { stringValue: d.fileUrl },
    fileName: { stringValue: d.fileName },
    assetId: { integerValue: String(d.assetId) },
    size: { integerValue: String(d.size) },
    createdAt: { integerValue: String(Date.now()) },
  };
  const docs = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/artifacts/zenithurl/public/data/apps`;
  const res = await fetch(`https://firestore.googleapis.com/v1/${docs}?documentId=${encodeURIComponent(id)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore write failed (${res.status}): ${await res.text()}`);
}

// --- handlers ---
async function handleUpload(request, url, env) {
  const bytes = await request.arrayBuffer();
  return json(await uploadToGitHub(bytes, url.searchParams.get('name'), env));
}
async function handleDelete(url, env) {
  const assetId = url.searchParams.get('assetId');
  if (!assetId) throw new Error('Missing assetId');
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${assetId}`, { method: 'DELETE', headers: gh(env) });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
  return json({ ok: true });
}
async function handlePublish(request, url, env) {
  const name = (url.searchParams.get('name') || '').trim();
  if (!name) throw new Error('Missing ?name=');
  const platform = url.searchParams.get('platform') || 'Other';
  const description = url.searchParams.get('description') || '';
  const filename = url.searchParams.get('filename') || `${name}.bin`;
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) throw new Error('Empty body — send the installer file as the request body');

  const uploaded = await uploadToGitHub(bytes, filename, env);
  const id = `${name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')}-${Date.now()}`;
  await writeAppDoc(env, id, { name, description, platform, fileUrl: uploaded.downloadUrl, fileName: filename, assetId: uploaded.assetId, size: uploaded.size });
  return json({ ok: true, id, downloadUrl: uploaded.downloadUrl });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const authHeader = request.headers.get('Authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    try {
      // Programmatic publish — authed by the publish key (for AIs / build scripts).
      if (url.pathname === '/publish' && request.method === 'POST') {
        if (!env.PUBLISH_KEY) return json({ error: 'PUBLISH_KEY secret is not set on this Worker' }, 500);
        if (!bearer || bearer !== env.PUBLISH_KEY) return json({ error: 'Invalid publish key' }, 401);
        if (!env.GH_TOKEN) return json({ error: 'GH_TOKEN secret is not set' }, 500);
        if (!env.SA_KEY) return json({ error: 'SA_KEY secret is not set' }, 500);
        return await handlePublish(request, url, env);
      }

      // Everything else is admin-only (the website, signed in with Google).
      try {
        if (!bearer) return json({ error: 'Missing token' }, 401);
        await verifyAdminToken(bearer);
      } catch (err) {
        return json({ error: `Unauthorized: ${err.message}` }, 401);
      }

      if (url.pathname === '/admin/key' && request.method === 'GET') {
        return json({ key: env.PUBLISH_KEY || '', publishUrl: `${url.origin}/publish` });
      }
      if (!env.GH_TOKEN) return json({ error: 'GH_TOKEN secret is not set on this Worker' }, 500);
      if (url.pathname === '/upload' && request.method === 'POST') return await handleUpload(request, url, env);
      if (url.pathname === '/delete' && request.method === 'POST') return await handleDelete(url, env);
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500);
    }
  },
};
