// HTTP server: the JSON search API plus the static website in /public.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES, COUNTRIES, DEFAULT_COUNTRY, findCity } from '../public/lib/places.js';
import { createSearcher } from './search.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('../public', import.meta.url)));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "img-src 'self' https: data:",
    "style-src 'self' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function parseSearchParams(params) {
  const q = (params.get('q') ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return { error: 'Enter a product to search for.' };
  if (q.length > 200) return { error: 'Search text is too long (200 characters max).' };
  const country = (params.get('country') || DEFAULT_COUNTRY).toUpperCase();
  if (!Object.hasOwn(COUNTRIES, country)) return { error: 'That country isn’t supported yet.' };
  if (CITIES[country]) {
    const city = params.get('city') ?? '';
    if (city && !findCity(country, city)) return { error: 'Pick a city from the list.' };
    return { q, zip: '', city, country };
  }
  const zip = (params.get('zip') ?? '').trim();
  if (!/^[A-Za-z0-9 -]{0,10}$/.test(zip)) {
    return { error: 'Postal codes can only contain letters, numbers, spaces and dashes.' };
  }
  return { q, zip, city: '', country };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'content-type': MIME_TYPES['.json'],
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function sendNotFound(res) {
  res.writeHead(404, { ...SECURITY_HEADERS, 'content-type': MIME_TYPES['.txt'] });
  res.end('Not found');
}

/** Maps a URL path to a file inside /public, or null if it points outside it. */
function publicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = path.resolve(PUBLIC_DIR, `.${decoded}`);
  return file === PUBLIC_DIR || file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

async function serveStatic(pathname, res) {
  let file = publicPath(pathname);
  if (!file) return sendNotFound(res);
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'content-type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(err.code)) return sendNotFound(res);
    throw err;
  }
}

/** A (req, res) request handler: used by the Node server below and by the Vercel functions in api/. */
export function createHandler(options = {}) {
  const searcher = options.searcher ?? createSearcher(options);

  async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      return sendJson(res, 405, { error: 'Method not allowed.' });
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/status') return sendJson(res, 200, searcher.status());
    if (url.pathname === '/api/search') {
      const params = parseSearchParams(url.searchParams);
      if (params.error) return sendJson(res, 400, { error: params.error });
      return sendJson(res, 200, await searcher.search(params));
    }
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found.' });
    return serveStatic(url.pathname, res);
  }

  return (req, res) => handle(req, res).catch((err) => {
    console.error(err);
    if (res.headersSent) res.end();
    else sendJson(res, 500, { error: 'Something went wrong on the server. Try again.' });
  });
}

export function createApp(options = {}) {
  return http.createServer(createHandler(options));
}
