// ZenithURL installer uploader — Cloudflare Worker.
//
// Purpose: give the website a secure "upload a file" box without a paid plan.
// The browser sends the installer + the admin's Firebase login token here.
// This Worker verifies the token really belongs to the admin, then pushes the
// file to the GitHub repo's Releases using a token that never touches the
// browser. Anyone can download the result; only the admin can upload/delete.
//
// Endpoints:
//   POST /upload?name=<filename>   body = raw file   -> { downloadUrl, fileName, size, assetId }
//   POST /delete?assetId=<id>                         -> { ok: true }
//
// Setup (see the chat steps): paste this into a Cloudflare Worker, add one
// secret named GITHUB_TOKEN, deploy, and copy the *.workers.dev URL.

const OWNER = 'BarneyBoy232';                 // GitHub account that owns the repo
const REPO = 'ZenithURL';                     // public repo whose Releases hold the files
const RELEASE_TAG = 'installers';             // one release holds all installers
const FIREBASE_PROJECT_ID = 'zenithurl-e9909';
const ADMIN_EMAIL = 'ethan.barnacoat@gmail.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// --- Firebase ID token verification (no libraries; uses built-in Web Crypto) ---

function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function b64urlToString(b64url) {
  return new TextDecoder().decode(b64urlToBytes(b64url));
}

async function verifyAdminToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const header = JSON.parse(b64urlToString(parts[0]));
  const payload = JSON.parse(b64urlToString(parts[1]));
  const now = Math.floor(Date.now() / 1000);

  // Who is this, and is it still valid?
  if (!payload.exp || payload.exp <= now) throw new Error('Token expired');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Wrong project');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Wrong issuer');
  if (payload.email !== ADMIN_EMAIL) throw new Error('Not the admin account');
  if (payload.email_verified !== true) throw new Error('Email not verified');

  // Is the signature genuinely from Google?
  const jwksRes = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const jwks = await jwksRes.json();
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), signed);
  if (!valid) throw new Error('Bad signature');

  return payload;
}

// --- GitHub helpers ---

function gh(env, extra = {}) {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'ZenithURL-Worker',
    'Accept': 'application/vnd.github+json',
    ...extra,
  };
}

// Find the shared "installers" release, or create it the first time.
async function ensureReleaseId(env) {
  let res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${RELEASE_TAG}`, { headers: gh(env) });
  if (res.ok) return (await res.json()).id;
  if (res.status !== 404) throw new Error(`Release lookup failed (${res.status})`);

  res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    headers: gh(env),
    body: JSON.stringify({ tag_name: RELEASE_TAG, name: 'Installers', body: 'ZenithURL app installers.' }),
  });
  if (!res.ok) throw new Error(`Release create failed (${res.status})`);
  return (await res.json()).id;
}

async function handleUpload(request, url, env) {
  const rawName = url.searchParams.get('name') || 'installer';
  const safe = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const assetName = `${Date.now()}-${safe}`;         // unique so names never clash

  const releaseId = await ensureReleaseId(env);
  const fileBytes = await request.arrayBuffer();      // Worker caps around 100 MB

  const res = await fetch(
    `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
    { method: 'POST', headers: gh(env, { 'Content-Type': 'application/octet-stream' }), body: fileBytes }
  );
  if (!res.ok) throw new Error(`GitHub upload failed (${res.status}): ${await res.text()}`);

  const asset = await res.json();
  return json({
    downloadUrl: asset.browser_download_url,
    fileName: asset.name,
    size: asset.size,
    assetId: asset.id,
  });
}

async function handleDelete(url, env) {
  const assetId = url.searchParams.get('assetId');
  if (!assetId) throw new Error('Missing assetId');
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${assetId}`, {
    method: 'DELETE', headers: gh(env),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);

    // Gate 1: must be the signed-in admin.
    try {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return json({ error: 'Missing token' }, 401);
      await verifyAdminToken(token);
    } catch (err) {
      return json({ error: `Unauthorized: ${err.message}` }, 401);
    }

    // Gate 2: route to the action.
    try {
      if (url.pathname === '/upload' && request.method === 'POST') return await handleUpload(request, url, env);
      if (url.pathname === '/delete' && request.method === 'POST') return await handleDelete(url, env);
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500);
    }
  },
};
