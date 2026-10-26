import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOffers, matchesQuery, rankOffers, sortOffers, summarize } from '../public/lib/deals.js';
import { demoOffers, demoResult } from '../public/lib/demo.js';

const offer = (fields) => ({ title: 'Widget', seller: 'Shop', source: 'test', condition: 'new', ...fields });

test('rankOffers puts the cheapest total first, not the cheapest sticker price', () => {
  const ranked = rankOffers([
    offer({ id: 'a', price: 90, shipping: 25 }),
    offer({ id: 'b', price: 100, shipping: 0 }),
    offer({ id: 'c', price: 95, shipping: 4.99 }),
  ]);
  assert.deepEqual(ranked.map((o) => o.id), ['c', 'b', 'a']);
  assert.equal(ranked[0].total, 99.99);
});

test('rankOffers lists offers with unknown shipping after priced ones', () => {
  const ranked = rankOffers([
    offer({ id: 'unknown', price: 10, shipping: null }),
    offer({ id: 'priced', price: 50, shipping: 5 }),
  ]);
  assert.deepEqual(ranked.map((o) => o.id), ['priced', 'unknown']);
  assert.equal(ranked[1].total, null);
});

test('rankOffers drops offers without a usable price or title', () => {
  const ranked = rankOffers([
    offer({ id: 'ok', price: 5, shipping: 0 }),
    offer({ id: 'zero', price: 0, shipping: 0 }),
    offer({ id: 'nan', price: Number.NaN, shipping: 0 }),
    offer({ id: 'untitled', title: ' ', price: 5, shipping: 0 }),
  ]);
  assert.deepEqual(ranked.map((o) => o.id), ['ok']);
});

test('sortOffers can sort by item price or by shipping', () => {
  const ranked = rankOffers([
    offer({ id: 'a', price: 90, shipping: 25 }),
    offer({ id: 'b', price: 100, shipping: 0 }),
    offer({ id: 'c', price: 95, shipping: null }),
  ]);
  assert.deepEqual(sortOffers(ranked, 'price').map((o) => o.id), ['a', 'c', 'b']);
  assert.deepEqual(sortOffers(ranked, 'shipping').map((o) => o.id), ['b', 'a', 'c']);
});

test('filterOffers applies condition, shipping and price filters', () => {
  const offers = rankOffers([
    offer({ id: 'new-free', price: 100, shipping: 0 }),
    offer({ id: 'used', condition: 'used', price: 80, shipping: 10 }),
    offer({ id: 'unknown', price: 95, shipping: null }),
    offer({ id: 'pricey', price: 140, shipping: 5 }),
  ]);
  const ids = (filters) => filterOffers(offers, { smart: false, ...filters }).map((o) => o.id);
  assert.deepEqual(ids({ condition: 'used' }), ['used']);
  assert.deepEqual(ids({ freeShippingOnly: true }), ['new-free']);
  assert.deepEqual(ids({ includeUnknownShipping: false }), ['used', 'new-free', 'pricey']);
  assert.deepEqual(ids({ maxTotal: 100 }), ['used', 'new-free', 'unknown']);
  assert.deepEqual(ids({ sources: new Set(['other']) }), []);
});

test('the smart filter hides accessories, parts and outliers but keeps real matches', () => {
  const offers = rankOffers([
    offer({ id: 'a', title: 'Sony WH-1000XM5 Headphones', price: 300, shipping: 0 }),
    offer({ id: 'b', title: 'Sony WH-1000XM5 with Carrying Case', price: 310, shipping: 0 }),
    offer({ id: 'c', title: 'Sony WH-1000XM5 Black', price: 290, shipping: 9 }),
    offer({ id: 'd', title: 'Hard Case for Sony WH-1000XM5', price: 120, shipping: 0 }),
    offer({ id: 'e', title: 'Sony WH-1000XM5', price: 40, shipping: 0 }),
    offer({ id: 'f', title: 'Sony WH-1000XM5 (broken)', condition: 'parts', price: 280, shipping: 0 }),
  ]);
  const kept = filterOffers(offers, {}, 'sony wh-1000xm5').map((o) => o.id).sort();
  assert.deepEqual(kept, ['a', 'b', 'c']);
  // Arabic accessory words count too.
  const arabic = rankOffers([
    offer({ id: 'p1', title: 'ايفون 15 برو 256', price: 3000, shipping: 0 }),
    offer({ id: 'p2', title: 'أيفون 15 برو ماكس', price: 3200, shipping: 0 }),
    offer({ id: 'p3', title: 'iPhone 15 Pro', price: 2900, shipping: 0 }),
    offer({ id: 'cover', title: 'كفر ايفون 15 برو', price: 1200, shipping: 0 }),
    offer({ id: 'used', title: 'ايفون 15 برو مستعمل', price: 1200, shipping: 0 }),
  ]);
  const arabicIds = filterOffers(arabic, {}, 'ايفون 15 برو').map((o) => o.id);
  assert.ok(!arabicIds.includes('cover'));
  assert.ok(arabicIds.includes('used'));
  // When the query asks for the accessory, it isn't hidden.
  const caseSearch = filterOffers(offers, {}, 'sony wh-1000xm5 case').map((o) => o.id);
  assert.ok(caseSearch.includes('d'));
});

test('matchesQuery keeps the searched product and drops other ones', () => {
  assert.ok(matchesQuery('Apple AirPods Pro 3 Wireless Earbuds', 'airpods pro'));
  assert.ok(matchesQuery('Apple Air Pods Pro', 'airpods pro'));
  assert.ok(!matchesQuery('Redmi Buds 5 Pro Bluetooth Earbuds', 'airpods pro'));
  assert.ok(!matchesQuery('AirPods 4 Wireless Earbuds', 'airpods pro'));
  assert.ok(matchesQuery('iPhone 15 Pro Max 256 GB', 'iphone 15 pro max 256gb'));
  assert.ok(!matchesQuery('iPhone 14 Pro', 'iphone 15 pro'));
  // Arabic spelling variants match each other.
  assert.ok(matchesQuery('أيفون 15 برو', 'ايفون 15 برو'));
  // Words in a script the title doesn't use are skipped: the number still has to match.
  assert.ok(matchesQuery('سماعات أيربودز برو 3', 'airpods pro'));
  assert.ok(matchesQuery('Apple iPhone 15 Pro', 'ايفون 15'));
  assert.ok(!matchesQuery('Samsung Galaxy S24', 'ايفون 15'));
});

test('summarize finds the best deal and how much the lowest sticker price really costs', () => {
  const offers = rankOffers([
    offer({ id: 'sticker', price: 90, shipping: 25 }),
    offer({ id: 'best', price: 100, shipping: 0 }),
    offer({ id: 'mid', price: 104, shipping: 6 }),
  ]);
  const summary = summarize(offers);
  assert.equal(summary.best.id, 'best');
  assert.equal(summary.lowestSticker.id, 'sticker');
  assert.equal(summary.stickerGap, 15);
  assert.equal(summary.typicalTotal, 110);
  assert.equal(summary.savingsVsTypical, 10);
  assert.equal(summarize([]), null);
});

test('demo offers are deterministic and show shipping changing the winner', () => {
  assert.deepEqual(demoOffers('Wireless Earbuds'), demoOffers('wireless   earbuds '.trim()));
  for (const query of ['wireless earbuds', 'macbook air', 'lego set', 'paperback novel', 'phone case']) {
    const result = demoResult(query);
    const visible = filterOffers(result.offers, {}, query);
    const summary = summarize(visible);
    assert.ok(summary.best, `best deal for ${query}`);
    assert.ok(summary.stickerGap > 0, `lowest sticker price should not win for ${query}`);
    assert.equal(visible.filter((o) => /charging cable|protective case/i.test(o.title)).length, 0);
  }
});
