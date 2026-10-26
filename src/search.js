// Runs a search across every price source that covers the buyer's country and merges
// the offers into one list ranked by total price (item + shipping).
import { COUNTRIES } from '../public/lib/places.js';
import { rankOffers } from '../public/lib/deals.js';
import { demoResult } from '../public/lib/demo.js';
import { createEbayProvider } from './providers/ebay.js';
import { createGoogleShoppingProvider } from './providers/google-shopping.js';
import { createHarajProvider } from './providers/haraj.js';
import { createNoonProvider } from './providers/noon.js';

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
  providers = [createNoonProvider(), createHarajProvider(), createEbayProvider(), createGoogleShoppingProvider()],
  now = Date.now,
} = {}) {
  const cache = new Map();
  // DISABLE_SOURCES=noon,haraj turns sources off without removing them from the code.
  const disabled = () => new Set((env.DISABLE_SOURCES ?? '').toLowerCase().split(',').map((id) => id.trim()));
  const isEnabled = (p) => p.isConfigured(env) && !disabled().has(p.id);

  function status() {
    return {
      sources: providers.map((p) => ({ id: p.id, name: p.name, configured: isEnabled(p), countries: p.countries })),
    };
  }

  async function search({ q, zip = '', city = '', country }) {
    const live = providers.filter((p) => isEnabled(p) && p.countries.includes(country));
    if (!live.length) return demoResult(q, country, zip, city);

    const key = JSON.stringify([q.toLowerCase(), zip.toUpperCase(), city, country]);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;

    const { currency } = COUNTRIES[country];
    const settled = await Promise.allSettled(live.map((p) => p.search({ q, zip, city, country }, { env, fetch })));
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
    const value = { query: q, zip, city, country, currency, demo: false, sources, offers, fetchedAt: new Date(now()).toISOString() };

    if (sources.some((s) => s.ok)) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    }
    return value;
  }

  return { search, status };
}
