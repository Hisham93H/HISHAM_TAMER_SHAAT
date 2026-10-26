import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAmazonProvider, normalizeAmazonItem } from '../src/providers/amazon.js';
import { createAliExpressProvider, normalizeAliExpressProduct, signAliExpress } from '../src/providers/aliexpress.js';
import { createNoonProvider } from '../src/providers/noon.js';
import { createHandler } from '../src/app.js';
import { createSearcher } from '../src/search.js';
import { parseShipping } from '../public/lib/money.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('normalizeAmazonItem reads price and delivery text', () => {
  const offer = normalizeAmazonItem({
    position: 1,
    asin: 'B0CHX1W1XY',
    title: 'Apple iPhone 15 Pro (256 GB) - Natural Titanium',
    link: 'https://www.amazon.sa/sspa/click?ie=UTF8',
    link_clean: 'https://www.amazon.sa/dp/B0CHX1W1XY/',
    thumbnail: 'https://m.media-amazon.com/images/I/81dT7CUY6GL._AC_UL320_.jpg',
    rating: 4.6,
    reviews: 1830,
    price: 'SAR 4,199.00',
    extracted_price: 4199,
    delivery: ['FREE delivery Sat, 1 Nov', 'Or fastest delivery Tomorrow, 30 Oct'],
  }, 'SAR');
  assert.equal(offer.price, 4199);
  assert.equal(offer.shipping, 0);
  assert.equal(offer.url, 'https://www.amazon.sa/dp/B0CHX1W1XY/');
  assert.equal(offer.delivery, 'FREE delivery Sat, 1 Nov · Or fastest delivery Tomorrow, 30 Oct');
  // A minimum order the item doesn't reach leaves shipping unknown.
  const small = normalizeAmazonItem({ title: 'Cable', extracted_price: 20, delivery: ['FREE delivery on orders over SAR 100 shipped by Amazon'] }, 'SAR');
  assert.equal(small.shipping, null);
  assert.equal(normalizeAmazonItem({ title: 'Case', extracted_price: 40, delivery: ['SAR 15 delivery Mon, 3 Nov'] }, 'SAR').shipping, 15);
});

test('Arabic "free delivery" counts as free shipping', () => {
  assert.equal(parseShipping('توصيل مجاني السبت، 1 نوفمبر'), 0);
});

test('free delivery for only some buyers is not counted as free', () => {
  assert.equal(parseShipping('FREE delivery Tomorrow, 27 Oct on your first order', 999), null);
  assert.equal(parseShipping('FREE delivery for Prime members', 999), null);
});

test('Amazon provider skips out-of-stock items', async () => {
  const fetch = async () => jsonResponse({
    organic_results: [
      { asin: 'A1', title: 'In stock', extracted_price: 100, delivery: ['FREE delivery'] },
      { asin: 'A2', title: 'Gone', extracted_price: 90, delivery: ['FREE delivery', 'Temporarily out of stock.'] },
    ],
  });
  const offers = await createAmazonProvider().search({ q: 'x', country: 'SA' }, { env: { SERPAPI_KEY: 'k' }, fetch });
  assert.deepEqual(offers.map((o) => o.id), ['amazon:A1']);
});

test('Amazon provider searches the local Amazon store in English', async () => {
  let url;
  const fetch = async (u) => {
    url = new URL(u);
    return jsonResponse({ organic_results: [{ asin: 'A1', title: 'Item', extracted_price: 100, delivery: ['FREE delivery'] }] });
  };
  const offers = await createAmazonProvider().search({ q: 'airpods', zip: '', country: 'SA' }, { env: { SERPAPI_KEY: 'k' }, fetch });
  assert.equal(url.searchParams.get('engine'), 'amazon');
  assert.equal(url.searchParams.get('k'), 'airpods');
  assert.equal(url.searchParams.get('amazon_domain'), 'amazon.sa');
  assert.equal(url.searchParams.get('language'), 'en_AE');
  assert.equal(offers[0].currency, 'SAR');

  const none = async () => jsonResponse({ error: "Amazon hasn't returned any results for this query." });
  assert.deepEqual(await createAmazonProvider().search({ q: 'zzz', country: 'SA' }, { env: { SERPAPI_KEY: 'k' }, fetch: none }), []);
});

test('signAliExpress matches the reference algorithm', () => {
  // Expected value computed with the official SDK's method (Python, hashlib.md5).
  const params = {
    app_key: '12345678', method: 'aliexpress.affiliate.product.query', sign_method: 'md5', timestamp: '1792990000000',
    format: 'json', v: '2.0', keywords: 'iphone 15 pro', ship_to_country: 'SA', target_currency: 'USD', target_language: 'EN', page_size: '50',
  };
  assert.equal(signAliExpress(params, 'test-secret'), '76310436CE2B7D7E5ADD2E459BF1E061');
});

test('AliExpress prices for Saudi Arabia are converted from dollars at 3.75', () => {
  const offer = normalizeAliExpressProduct({
    product_id: 1005006041234567,
    product_title: 'TWS Wireless Earbuds Bluetooth 5.3',
    product_main_image_url: 'https://ae01.alicdn.com/kf/S1234.jpg',
    product_detail_url: 'https://www.aliexpress.com/item/1005006041234567.html',
    promotion_link: 'https://s.click.aliexpress.com/e/_abc',
    target_sale_price: '12.40',
    target_sale_price_currency: 'USD',
    evaluate_rate: '96.1%',
  }, 'SAR');
  assert.equal(offer.price, 46.5);
  assert.equal(offer.currency, 'SAR');
  assert.equal(offer.url, 'https://s.click.aliexpress.com/e/_abc');
  assert.equal(offer.shipping, null);
  assert.equal(offer.sellerFeedback, '96.1% positive');
  assert.equal(normalizeAliExpressProduct({ product_id: 2, product_title: 'x', target_sale_price: '9.99' }, 'GBP').price, 9.99);
});

test('AliExpress provider signs the request and reads the products', async () => {
  let sent;
  const fetch = async (u, init) => {
    sent = { url: new URL(u), body: new URLSearchParams(init.body), method: init.method };
    return jsonResponse({
      aliexpress_affiliate_product_query_response: {
        resp_result: { resp_code: 200, resp_msg: 'success', result: { products: { product: [{ product_id: 7, product_title: 'Earbuds', target_sale_price: '10.00' }] } } },
      },
    });
  };
  const env = { ALIEXPRESS_APP_KEY: '12345678', ALIEXPRESS_APP_SECRET: 'test-secret' };
  const offers = await createAliExpressProvider().search({ q: 'earbuds', country: 'SA' }, { env, fetch, now: () => 1792990000000 });
  assert.equal(sent.method, 'POST');
  assert.equal(sent.url.origin + sent.url.pathname, 'https://api-sg.aliexpress.com/sync');
  assert.equal(sent.body.get('ship_to_country'), 'SA');
  assert.equal(sent.body.get('target_currency'), 'USD');
  const signed = { ...Object.fromEntries(sent.url.searchParams), ...Object.fromEntries(sent.body) };
  delete signed.sign;
  assert.equal(sent.url.searchParams.get('sign'), signAliExpress(signed, 'test-secret'));
  assert.deepEqual(offers.map((o) => [o.id, o.price]), [['aliexpress:7', 37.5]]);
});

test('AliExpress provider reports API errors and treats an empty result as no offers', async () => {
  const env = { ALIEXPRESS_APP_KEY: 'k', ALIEXPRESS_APP_SECRET: 's' };
  const bad = async () => jsonResponse({ error_response: { code: 'IncompleteSignature', msg: 'The request signature does not conform to platform standards' } });
  await assert.rejects(createAliExpressProvider().search({ q: 'x', country: 'SA' }, { env, fetch: bad }), /signature does not conform/);
  const empty = async () => jsonResponse({ aliexpress_affiliate_product_query_response: { resp_result: { resp_code: 405, resp_msg: 'The result is empty' } } });
  assert.deepEqual(await createAliExpressProvider().search({ q: 'x', country: 'SA' }, { env, fetch: empty }), []);
});

test('noon is turned off on Vercel', () => {
  assert.equal(createNoonProvider().isConfigured({}), true);
  assert.equal(createNoonProvider().isConfigured({ VERCEL: '1' }), false);
});

test('the Vercel handler answers the search API', async () => {
  const handler = createHandler({ searcher: createSearcher({ env: {}, providers: [] }) });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const body = await (await fetch(`http://127.0.0.1:${server.address().port}/api/search?q=earbuds`)).json();
    assert.equal(body.country, 'SA');
    assert.ok(body.offers.length > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
