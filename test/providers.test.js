import test from 'node:test';
import assert from 'node:assert/strict';
import { createEbayProvider, ebayCondition, normalizeEbayItem } from '../src/providers/ebay.js';
import { createGoogleShoppingProvider, normalizeGoogleItem } from '../src/providers/google-shopping.js';
import { createSearcher } from '../src/search.js';

const ebayItem = {
  itemId: 'v1|1234|0',
  title: 'Nintendo Switch OLED Console',
  itemWebUrl: 'https://www.ebay.com/itm/1234',
  image: { imageUrl: 'https://i.ebayimg.com/images/g/abc/s-l500.jpg' },
  price: { value: '289.99', currency: 'USD' },
  conditionId: '1000',
  condition: 'New',
  seller: { username: 'gamehub', feedbackPercentage: '99.6' },
  shippingOptions: [
    { shippingCostType: 'FIXED', shippingCost: { value: '12.00', currency: 'USD' } },
    {
      shippingCostType: 'FIXED',
      shippingCost: { value: '7.50', currency: 'USD' },
      minEstimatedDeliveryDate: '2026-10-30T07:00:00.000Z',
      maxEstimatedDeliveryDate: '2026-11-02T07:00:00.000Z',
    },
  ],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('normalizeEbayItem picks the cheapest shipping option', () => {
  const offer = normalizeEbayItem(ebayItem);
  assert.equal(offer.price, 289.99);
  assert.equal(offer.shipping, 7.5);
  assert.equal(offer.currency, 'USD');
  assert.equal(offer.condition, 'new');
  assert.equal(offer.delivery, 'Arrives Oct 30 – Nov 2');
  assert.equal(offer.sellerFeedback, '99.6% positive');
});

test('normalizeEbayItem marks shipping unknown when eBay gives no cost', () => {
  const offer = normalizeEbayItem({ ...ebayItem, shippingOptions: [{ shippingCostType: 'CALCULATED' }] });
  assert.equal(offer.shipping, null);
  assert.equal(normalizeEbayItem({ ...ebayItem, shippingOptions: undefined }).shipping, null);
});

test('ebayCondition maps condition IDs and text', () => {
  assert.equal(ebayCondition(1500), 'new');
  assert.equal(ebayCondition(2500), 'refurbished');
  assert.equal(ebayCondition(3000), 'used');
  assert.equal(ebayCondition(7000), 'parts');
  assert.equal(ebayCondition(undefined, 'Like New'), 'used');
  assert.equal(ebayCondition(undefined, 'Brand New'), 'new');
});

test('eBay provider signs in once and sends the buyer location', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/oauth2/token')) return jsonResponse({ access_token: 'tok', expires_in: 7200 });
    return jsonResponse({ itemSummaries: [ebayItem] });
  };
  const env = { EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'secret' };
  const provider = createEbayProvider();
  await provider.search({ q: 'switch oled', zip: '10001', country: 'US' }, { env, fetch });
  const offers = await provider.search({ q: 'switch oled', zip: '10001', country: 'US' }, { env, fetch });

  assert.equal(offers.length, 1);
  assert.equal(calls.filter((c) => c.url.includes('/oauth2/token')).length, 1);
  const searchCall = calls.find((c) => c.url.includes('/item_summary/search'));
  const url = new URL(searchCall.url);
  assert.equal(url.searchParams.get('q'), 'switch oled');
  assert.equal(url.searchParams.get('filter'), 'buyingOptions:{FIXED_PRICE},deliveryCountry:US');
  assert.equal(searchCall.init.headers['x-ebay-c-marketplace-id'], 'EBAY_US');
  assert.equal(searchCall.init.headers['x-ebay-c-enduserctx'], 'contextualLocation=country%3DUS%2Czip%3D10001');
  assert.equal(searchCall.init.headers.authorization, 'Bearer tok');
});

test('normalizeGoogleItem reads shipping from the delivery text', () => {
  const offer = normalizeGoogleItem({
    position: 1,
    product_id: '987',
    title: 'Nintendo Switch OLED',
    link: 'https://www.example-store.com/switch',
    source: 'Example Store',
    price: '$299.00',
    extracted_price: 299,
    delivery: '$9.99 delivery',
    rating: 4.8,
    reviews: 1520,
    thumbnail: 'https://encrypted-tbn0.gstatic.com/shopping?q=tbn:abc',
  }, 'USD');
  assert.equal(offer.price, 299);
  assert.equal(offer.shipping, 9.99);
  assert.equal(offer.seller, 'Example Store');
  assert.equal(offer.condition, 'new');
  assert.equal(normalizeGoogleItem({ title: 'x', extracted_price: 5, second_hand_condition: 'refurbished' }, 'USD').condition, 'refurbished');
});

test('Google Shopping provider treats "no results" as an empty list', async () => {
  const provider = createGoogleShoppingProvider();
  const fetch = async () => jsonResponse({ error: "Google hasn't returned any results for this query." });
  assert.deepEqual(await provider.search({ q: 'zzzz', country: 'US' }, { env: { SERPAPI_KEY: 'k' }, fetch }), []);
  const failing = async () => jsonResponse({ error: 'Invalid API key.' }, 401);
  await assert.rejects(provider.search({ q: 'x', country: 'US' }, { env: { SERPAPI_KEY: 'k' }, fetch: failing }), /Invalid API key/);
});

test('searcher returns demo data when no source is configured', async () => {
  const searcher = createSearcher({ env: {} });
  const result = await searcher.search({ q: 'air fryer', zip: '', country: 'US' });
  assert.equal(result.demo, true);
  assert.ok(result.offers.length > 5);
  assert.equal(searcher.status().demo, true);
});

test('searcher merges sources, keeps going when one fails, and caches results', async () => {
  let calls = 0;
  const good = {
    id: 'good',
    name: 'Good Source',
    isConfigured: () => true,
    async search() {
      calls += 1;
      return [
        { id: 'g1', title: 'Item', seller: 'A', source: 'good', price: 50, shipping: 10, currency: 'USD', url: 'https://a.example/1' },
        { id: 'g2', title: 'Item', seller: 'B', source: 'good', price: 55, shipping: 0, currency: 'USD', url: 'https://a.example/2' },
        { id: 'g3', title: 'Item', seller: 'C', source: 'good', price: 30, shipping: 0, currency: 'EUR', url: 'https://a.example/3' },
        { id: 'dupe', title: 'Item', seller: 'B', source: 'good', price: 56, shipping: 0, currency: 'USD', url: 'https://a.example/2' },
      ];
    },
  };
  const broken = {
    id: 'broken',
    name: 'Broken Source',
    isConfigured: () => true,
    async search() { throw new Error('Service unavailable'); },
  };
  const searcher = createSearcher({ env: {}, providers: [good, broken] });
  const result = await searcher.search({ q: 'item', zip: '', country: 'US' });

  assert.equal(result.demo, false);
  assert.deepEqual(result.offers.map((o) => o.id), ['g2', 'g1']);
  assert.deepEqual(result.sources, [
    { id: 'good', name: 'Good Source', ok: true, count: 2 },
    { id: 'broken', name: 'Broken Source', ok: false, count: 0, error: 'Service unavailable' },
  ]);
  await searcher.search({ q: 'ITEM', zip: '', country: 'US' });
  assert.equal(calls, 1);
});
