// Sample offers from fictional stores, used when no live price source is set up.
// The same query always produces the same offers.
import { COUNTRIES } from './money.js';
import { rankOffers } from './deals.js';

const STORES = [
  'Northwind Outlet', 'Pebble & Pine', 'Crate Corner', 'Sunday Supply Co.', 'Voltage Mart',
  'Harbor Goods', 'Maple Direct', 'Quartz Electronics', 'Lumen Depot', 'Fieldstone Market',
  'Orbit Deals', 'Cobalt & Co.',
];

const ACCESSORY_QUERY = /\b(case|cover|cable|charger|protector|adapter|strap)s?\b/;

// Rough typical prices, so sample offers look plausible for the query.
const PRICE_HINTS = [
  [ACCESSORY_QUERY, 15],
  [/laptop|macbook|notebook|chromebook/, 780],
  [/iphone|galaxy|pixel|smartphone|\bphone/, 640],
  [/playstation|ps5|xbox|nintendo|switch|console/, 410],
  [/\btv\b|television|monitor/, 420],
  [/camera|gopro|drone/, 520],
  [/tablet|ipad|kindle/, 330],
  [/headphone|earbud|airpods|headset|speaker/, 140],
  [/watch|fitbit|garmin/, 240],
  [/vacuum|roomba|dyson/, 260],
  [/espresso|coffee|blender|air fryer|mixer/, 150],
  [/shoe|sneaker|boot|jacket/, 95],
  [/lego/, 70],
  [/keyboard|mouse|router|ssd/, 75],
  [/drill|saw|tool/, 120],
  [/book|novel/, 19],
];

const DELIVERY = ['Arrives in 2–4 days', 'Arrives in 3–5 days', 'Arrives in 4–7 days', 'Ships next business day'];
const SUFFIXES = ['', ' – Latest Model', ' – Retail Box', ' with 2-Year Warranty', ' – Bundle Edition', ' (Sealed)'];

function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function seededRandom(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shop-style prices: 7.99, 129.99.
function charm(n) {
  return n < 20 ? Math.floor(n) + 0.99 : Math.round(n) - 0.01;
}

function titleCase(text) {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function demoOffers(query, country = 'US') {
  const q = query.trim().replace(/\s+/g, ' ');
  const lower = q.toLowerCase();
  const rand = seededRandom(hash(`${lower}|${country}`));
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const base = PRICE_HINTS.find(([pattern]) => pattern.test(lower))?.[1] ?? 45;
  const fee = (share) => charm(between(3, 6) + base * share);
  const name = titleCase(q);
  const currency = COUNTRIES[country]?.currency ?? 'USD';
  const stores = [...STORES];
  for (let i = stores.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [stores[i], stores[j]] = [stores[j], stores[i]];
  }

  const offers = [];
  const add = (fields) => offers.push({
    id: `demo:${offers.length + 1}`,
    url: null,
    image: null,
    source: 'demo',
    sourceName: 'Sample data',
    currency,
    rating: Math.round(between(3.9, 4.9) * 10) / 10,
    reviews: Math.round(between(12, 4200)),
    sellerFeedback: null,
    delivery: pick(DELIVERY),
    ...fields,
  });

  // The lowest sticker price, made expensive by its shipping fee...
  add({ title: name + pick(SUFFIXES), seller: stores[0], condition: 'new', price: charm(base * 0.79), shipping: charm(base * 0.15 + 6) });
  // ...and a slightly higher price with free shipping: the real best deal.
  add({ title: name, seller: stores[1], condition: 'new', price: charm(base * 0.86), shipping: 0 });

  for (let i = 2; i < 11; i++) {
    if (i === 4 || i === 7) {
      const used = i === 4;
      add({
        title: used ? `${name} – Pre-owned, Good Condition` : `${name} (Renewed)`,
        seller: stores[i],
        condition: used ? 'used' : 'refurbished',
        price: charm(base * between(0.83, 0.92)),
        shipping: fee(between(0.04, 0.08)),
      });
      continue;
    }
    const roll = rand();
    const shipping = roll < 0.4 ? 0 : roll < 0.9 ? fee(between(0.01, 0.05)) : null;
    add({
      title: name + pick(SUFFIXES),
      seller: stores[i],
      condition: 'new',
      price: charm(base * between(0.89, 1.18)),
      shipping,
      ...(shipping == null && { delivery: 'Shipping calculated at checkout' }),
    });
  }

  // Cheap accessories that the "hide accessories" filter should catch.
  if (!ACCESSORY_QUERY.test(lower)) {
    add({ title: `Protective Case for ${name}`, seller: pick(stores), condition: 'new', price: charm(Math.max(6, base * 0.06)), shipping: 0 });
    add({ title: `Replacement Charging Cable for ${name}`, seller: pick(stores), condition: 'new', price: charm(Math.max(5, base * 0.04)), shipping: 2.99 });
  }
  return offers;
}

/** A complete search response built from sample data, in the same shape the server returns. */
export function demoResult(query, country = 'US', zip = '') {
  const offers = rankOffers(demoOffers(query, country));
  return {
    query,
    zip,
    country,
    currency: COUNTRIES[country]?.currency ?? 'USD',
    demo: true,
    sources: [{ id: 'demo', name: 'Sample data', ok: true, count: offers.length }],
    offers,
    fetchedAt: new Date().toISOString(),
  };
}
