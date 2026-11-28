// Local server for Photo Vortex: serves the site and the Google Photos relay.
// No dependencies. Run with `npm start` (or `node server.js`) and open http://localhost:8080
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import relay from './api/google.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/api/google') return relay(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end(); }

  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root + path.sep) || rel.includes('\0') || /(^|[\\/])\.|node_modules|server\.js|api[\\/]/.test(path.relative(root, file))) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`Photo Vortex running at http://localhost:${PORT}`);
});
