// Runs a search across every price source that covers the buyer's country, ranked by
// total price (item + shipping), with a short cache to save API quota.
import { demoResult } from '../public/lib/demo.js';
import { createHarajProvider } from '../public/lib/haraj.js';
import { searchSources } from '../public/lib/sources.js';
import { createAliExpressProvider } from './providers/aliexpress.js';
import { createAmazonProvider } from './providers/amazon.js';
import { createEbayProvider } from './providers/ebay.js';
import { createGoogleShoppingProvider } from './providers/google-shopping.js';
import { createNoonProvider } from './providers/noon.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 200;

export function createSearcher({
  env = process.env,
  fetch = globalThis.fetch,
  providers = [
    createNoonProvider(),
    createHarajProvider(),
    createAmazonProvider(),
    createAliExpressProvider(),
    createEbayProvider(),
    createGoogleShoppingProvider(),
  ],
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

    const value = await searchSources(live, { q, zip, city, country }, { env, fetch });
    if (value.sources.some((s) => s.ok)) {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    }
    return value;
  }

  return { search, status };
}
