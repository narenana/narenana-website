// Static-only local content preview. No Wrangler, service bindings, database or proxy.
// Run: node scripts/preview-content.mjs (http://127.0.0.1:5198)
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../site'));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};
const headers = {
  'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  // In particular, existing homepage JS cannot fetch production leaderboard data.
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const inside = (path) => path === root || path.startsWith(root + sep);

createServer(async (request, response) => {
  const reply = (status, message) => {
    response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(request.method)) return reply(405, 'Static preview supports GET and HEAD only.');
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1:5198').pathname);
    if (/[\\\0:]/.test(path)) return reply(400, 'Invalid path.');
    let target = resolve(root, '.' + path);
    if (!inside(target)) return reply(403, 'Path outside the static site.');
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) target = resolve(target, 'index.html');
    else if (!info && !extname(target)) target += '.html';
    const actual = await realpath(target).catch(() => null);
    if (!actual) return reply(404, 'Static page not found. APIs are not served in this preview.');
    if (!inside(actual)) return reply(403, 'Path outside the static site.');
    if (!(await stat(actual)).isFile()) return reply(404, 'Static file not found.');
    const body = await readFile(actual);
    response.writeHead(200, { ...headers, 'Content-Type': mime[extname(actual)] || 'application/octet-stream', 'Content-Length': body.length });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    reply(400, 'Invalid request.');
  }
}).listen(5198, '127.0.0.1', () => {
  console.log('Static-only preview: http://127.0.0.1:5198/nanawing/aircraft/');
  console.log('No service bindings or production data. External network requests are blocked by CSP.');
});
