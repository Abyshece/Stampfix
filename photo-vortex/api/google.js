// Same-origin relay for Google Photos requests.
//
// Google's photo servers don't send CORS headers, so a browser can't read the bytes of
// a picked photo directly. The page sends the request here with the user's access
// token; this relay forwards it to Google and streams the answer back. Nothing is stored.
//
// Works as a Vercel function (api/google.js) and is reused by server.js for local runs.

const ALLOWED_HOSTS = [/^photospicker\.googleapis\.com$/, /^[a-z0-9-]+\.googleusercontent\.com$/];
const METHODS = new Set(['GET', 'POST', 'DELETE']);
const MAX_BODY = 64 * 1024;

function send(res, status, message) {
  res.statusCode = status;
  res.setHeader('x-pv-relay', '1');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: { message } }));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  let target;
  try {
    target = new URL(new URL(req.url, 'http://local').searchParams.get('u') || '');
  } catch {
    return send(res, 400, 'Missing or invalid u parameter.');
  }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.some((r) => r.test(target.hostname))) {
    return send(res, 403, 'That host is not allowed.');
  }
  if (!METHODS.has(req.method)) return send(res, 405, 'Method not allowed.');
  const auth = req.headers.authorization || '';
  if (!/^Bearer [A-Za-z0-9._~+/-]+=*$/.test(auth)) return send(res, 401, 'Missing Google access token.');

  let body;
  if (req.method === 'POST') {
    try { body = await readBody(req); } catch { return send(res, 413, 'Request too large.'); }
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: { authorization: auth, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body && body.length ? body : undefined,
      redirect: 'follow',
    });
  } catch {
    return send(res, 502, 'Could not reach Google.');
  }

  res.statusCode = upstream.status;
  res.setHeader('x-pv-relay', '1');
  res.setHeader('content-type', upstream.headers.get('content-type') || 'application/octet-stream');
  res.setHeader('cache-control', 'private, no-store');
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
