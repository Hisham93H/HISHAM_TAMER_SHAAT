// Runs a search across every configured price source and merges the offers
// into one list ranked by total price (item + shipping).
import { COUNTRIES } from '../public/lib/money.js';
import { rankOffers } from '../public/lib/deals.js';
import { demoResult } from '../public/lib/demo.js';
import { createEbayProvider } from './providers/ebay.js';
import { createGoogleShoppingProvider } from './providers/google-shopping.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 200;

function dedupeByUrl(offers) {
  const seen = new Set();
  return offers.filter((offer) => {
    if (!offer.url) return true;
    if (seen.has(offer.url)) return false;
    seen.add(offer.url);
    return true;
  });
}

export function createSearcher({
  env = process.env,
  fetch = globalThis.fetch,
  providers = [createEbayProvider(), createGoogleShoppingProvider()],
  now = Date.now,
} = {}) {
  const cache = new Map();
  const configured = () => providers.filter((p) => p.isConfigured(env));

  function status() {
    return {
      demo: configured().length === 0,
      sources: providers.map((p) => ({ id: p.id, name: p.name, configured: p.isConfigured(env) })),
    };
  }

  async function search({ q, zip = '', country = 'US' }) {
    const live = configured();
    if (!live.length) return demoResult(q, country, zip);

    const key = JSON.stringify([q.toLowerCase(), zip.toUpperCase(), country]);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;

    const { currency } = COUNTRIES[country];
    const settled = await Promise.allSettled(live.map((p) => p.search({ q, zip, country }, { env, fetch })));
    // Offers in another currency can't be compared fairly, so they are left out.
    const offers = dedupeByUrl(rankOffers(settled.flatMap((r) =>
      r.status === 'fulfilled' ? r.value.filter((o) => o.currency === currency) : [])));
    const sources = settled.map((r, i) => ({
      id: live[i].id,
      name: live[i].name,
      ok: r.status === 'fulfilled',
      count: offers.filter((o) => o.source === live[i].id).length,
      ...(r.status === 'rejected' && { error: r.reason?.message ?? 'Unknown error' }),
    }));
    const value = { query: q, zip, country, currency, demo: false, sources, offers, fetchedAt: new Date(now()).toISOString() };

    if (sources.some((s) => s.ok)) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    }
    return value;
  }

  return { search, status };
}
