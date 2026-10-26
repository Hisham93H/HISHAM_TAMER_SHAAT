import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createSearcher } from '../src/search.js';

async function withServer(fn) {
  const server = createApp({ searcher: createSearcher({ env: {} }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function rawGet(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

test('serves the website', async () => {
  await withServer(async (base) => {
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /Hisham’s Tool/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);

    const lib = await fetch(`${base}/lib/deals.js`);
    assert.equal(lib.status, 200);
    assert.match(lib.headers.get('content-type'), /javascript/);
  });
});

test('search API returns ranked offers', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/search?q=robot+vacuum&zip=94107&country=us`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.query, 'robot vacuum');
    assert.equal(body.country, 'US');
    assert.equal(body.demo, true);
    const totals = body.offers.filter((o) => o.total != null).map((o) => o.total);
    assert.deepEqual(totals, [...totals].sort((a, b) => a - b));
  });
});

test('search API rejects bad input', async () => {
  await withServer(async (base) => {
    for (const query of ['', 'q=', 'q=tv&country=XX', 'q=tv&zip=<script>', `q=${'a'.repeat(201)}`]) {
      const res = await fetch(`${base}/api/search?${query}`);
      assert.equal(res.status, 400, query);
      assert.ok((await res.json()).error);
    }
    const post = await fetch(`${base}/api/search?q=tv`, { method: 'POST' });
    assert.equal(post.status, 405);
  });
});

test('status API reports demo mode', async () => {
  await withServer(async (base) => {
    const body = await (await fetch(`${base}/api/status`)).json();
    assert.equal(body.demo, true);
    assert.deepEqual(body.sources.map((s) => s.id), ['ebay', 'google']);
  });
});

test('static files cannot escape the public folder', async () => {
  await withServer(async (base, port) => {
    assert.equal(await rawGet(port, '/../package.json'), 404);
    assert.equal(await rawGet(port, '/..%2fpackage.json'), 404);
    assert.equal(await rawGet(port, '/%2e%2e/%2e%2e/etc/passwd'), 404);
    assert.equal(await rawGet(port, '/lib/%00'), 404);
    assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  });
});
