import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarajProvider, harajCondition, normalizeHarajPost } from '../src/providers/haraj.js';
import { createNoonProvider, normalizeNoonHit } from '../src/providers/noon.js';
import { createSearcher } from '../src/search.js';
import { findCity } from '../public/lib/places.js';
import { rankOffers } from '../public/lib/deals.js';

// Trimmed from a real haraj.com.sa search response (October 2026).
const harajPosts = [
  {
    id: 191332077,
    title: 'ايفون 15 برو ماكس 512',
    URL: '11191332077/ايفون_15_برو_ماكس_512/',
    city: 'جده',
    authorUsername: 'abu_fahad',
    status: true,
    price: { inputPrice: '3000' },
    imagesList: ['https://mimg6cdn.haraj.com.sa/userfiles30/2026-10-26/1200x1599_258CC4E6.jpg'],
  },
  {
    id: 191332347,
    title: 'iPhone 15 Pro Max جديد مختوم',
    URL: '11191332347/iPhone_15_Pro_Max/',
    city: 'الرياض',
    authorUsername: 'tech_store',
    status: true,
    price: { inputPrice: '2800' },
    imagesList: [],
  },
  { id: 191333042, title: 'أيفون 15', URL: '11191333042/أيفون_15/', city: 'الرياض', authorUsername: 'عضو', status: true, price: { inputPrice: '0' }, imagesList: [] },
  { id: 191333100, title: 'ايفون 15 مباع', URL: '11191333100/x/', city: 'الرياض', status: false, price: { inputPrice: '1500' }, imagesList: [] },
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('Haraj listings in your city are free local pickup', () => {
  const riyadh = findCity('SA', 'riyadh');
  const local = normalizeHarajPost(harajPosts[1], riyadh);
  assert.equal(local.shipping, 0);
  assert.equal(local.pickup, true);
  assert.equal(local.delivery, 'Pickup in Riyadh');
  assert.equal(local.condition, 'new');

  const elsewhere = normalizeHarajPost(harajPosts[0], riyadh);
  assert.equal(elsewhere.shipping, null);
  assert.match(elsewhere.delivery, /Seller is in جده/);
  assert.equal(elsewhere.price, 3000);
  assert.equal(elsewhere.currency, 'SAR');
  assert.equal(elsewhere.url, 'https://haraj.com.sa/11191332077/%D8%A7%D9%8A%D9%81%D9%88%D9%86_15_%D8%A8%D8%B1%D9%88_%D9%85%D8%A7%D9%83%D8%B3_512/');
  assert.equal(elsewhere.image, harajPosts[0].imagesList[0]);
});

test('Haraj city names match despite spelling differences', () => {
  const jeddah = findCity('SA', 'jeddah');
  assert.equal(normalizeHarajPost({ ...harajPosts[0], city: 'جدة' }, jeddah).shipping, 0);
  const abha = findCity('SA', 'abha');
  assert.equal(normalizeHarajPost({ ...harajPosts[0], city: 'ابها' }, abha).shipping, 0);
});

test('harajCondition defaults to used and spots new items', () => {
  assert.equal(harajCondition('ايفون 15 جديد'), 'new');
  assert.equal(harajCondition('ايفون 15 شبه جديد'), 'used');
  assert.equal(harajCondition('Sealed PS5'), 'new');
  assert.equal(harajCondition('ايفون 15 برو'), 'used');
});

test('Haraj provider searches, drops sold posts, and ranking skips unpriced ones', async () => {
  let sent;
  const fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return jsonResponse({ data: { search: { items: harajPosts } } });
  };
  const offers = await createHarajProvider().search({ q: 'ايفون 15', city: 'riyadh', country: 'SA' }, { fetch });
  assert.match(sent.url, /^https:\/\/graphql\.haraj\.com\.sa\//);
  assert.equal(sent.body.variables.search, 'ايفون 15');
  assert.equal(offers.length, 3);
  const ranked = rankOffers(offers);
  assert.deepEqual(ranked.map((o) => o.id), ['haraj:191332347', 'haraj:191332077']);
});

test('Haraj provider reports GraphQL errors', async () => {
  const fetch = async () => jsonResponse({ errors: [{ message: 'Query too complex' }] });
  await assert.rejects(createHarajProvider().search({ q: 'x', country: 'SA' }, { fetch }), /Query too complex/);
});

test('normalizeNoonHit builds the Saudi product link and uses the sale price', () => {
  const offer = normalizeNoonHit({
    sku: 'N70035293V',
    name: 'Apple iPhone 15 Pro 256GB Natural Titanium 5G',
    url: 'iphone-15-pro-256gb-natural-titanium-5g',
    price: 4699,
    sale_price: 4199,
    image_key: 'v1694689767/N70035293V_1',
    product_rating: { value: 4.7, count: 2210 },
  });
  assert.equal(offer.price, 4199);
  assert.equal(offer.currency, 'SAR');
  assert.equal(offer.shipping, null);
  assert.equal(offer.url, 'https://www.noon.com/saudi-en/iphone-15-pro-256gb-natural-titanium-5g/N70035293V/p/');
  assert.equal(offer.image, 'https://f.nooncdn.com/p/v1694689767/N70035293V_1.jpg');
  assert.equal(offer.rating, 4.7);
  assert.equal(normalizeNoonHit({ sku: 'X', name: 'iPhone 13 (Renewed)', price: 1200 }).condition, 'refurbished');
});

test('noon provider asks for the Saudi store and explains when it is blocked', async () => {
  let headers;
  const ok = async (url, init) => {
    headers = init.headers;
    return jsonResponse({ hits: [{ sku: 'A1', name: 'Item', url: 'item', price: 100 }, { sku: 'A2', name: 'Gone', price: 50, is_buyable: false }] });
  };
  const offers = await createNoonProvider().search({ q: 'item', country: 'SA' }, { fetch: ok });
  assert.equal(headers['x-locale'], 'en-sa');
  assert.deepEqual(offers.map((o) => o.id), ['noon:A1']);

  const blocked = async () => new Response('<html>Access denied</html>', { status: 403 });
  await assert.rejects(createNoonProvider().search({ q: 'x', country: 'SA' }, { fetch: blocked }), /HTTP 403.*computer in Saudi Arabia/);
  const challenge = async () => new Response('<html>challenge</html>', { status: 200 });
  await assert.rejects(createNoonProvider().search({ q: 'x', country: 'SA' }, { fetch: challenge }), /something other than search results/);
  const offline = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(createNoonProvider().search({ q: 'x', country: 'SA' }, { fetch: offline }), /didn’t answer/);
});

test('searcher only uses sources that cover the country, and DISABLE_SOURCES turns one off', async () => {
  const used = [];
  const fake = (id, countries) => ({
    id, name: id, countries, isConfigured: () => true,
    async search() { used.push(id); return []; },
  });
  const providers = [fake('noon', ['SA']), fake('haraj', ['SA']), fake('ebay', ['US'])];

  await createSearcher({ env: {}, providers }).search({ q: 'tv', country: 'SA' });
  assert.deepEqual(used.sort(), ['haraj', 'noon']);

  used.length = 0;
  const result = await createSearcher({ env: { DISABLE_SOURCES: 'noon' }, providers }).search({ q: 'tv', country: 'SA' });
  assert.deepEqual(used, ['haraj']);
  assert.deepEqual(result.sources.map((s) => s.id), ['haraj']);
});
