// Amazon search results through SerpAPI (Amazon's own Creators API needs an Associates
// account with sales). Uses the local Amazon store for each country, e.g. amazon.sa.
// Shipping comes from the listing's delivery text, e.g. "FREE delivery Sat, 1 Nov".
// Docs: https://serpapi.com/amazon-search-api
import { parseMoney, parseShipping } from '../../public/lib/money.js';
import { COUNTRIES } from '../../public/lib/places.js';

const TIMEOUT_MS = 15_000;
const DOMAINS = {
  SA: 'amazon.sa',
  US: 'amazon.com',
  CA: 'amazon.ca',
  GB: 'amazon.co.uk',
  AU: 'amazon.com.au',
  DE: 'amazon.de',
  FR: 'amazon.fr',
  IT: 'amazon.it',
  ES: 'amazon.es',
};
// amazon.sa answers in Arabic unless asked for English.
const LANGUAGES = { SA: 'en_AE' };

export function normalizeAmazonItem(item, currency) {
  const price = item.extracted_price ?? parseMoney(item.price);
  const delivery = Array.isArray(item.delivery) ? item.delivery.join(' · ') : item.delivery ?? null;
  return {
    id: `amazon:${item.asin ?? item.position}`,
    title: item.title,
    url: item.link_clean ?? item.link ?? null,
    image: item.thumbnail ?? null,
    source: 'amazon',
    sourceName: 'Amazon',
    seller: 'Amazon',
    price,
    currency,
    shipping: parseShipping(delivery, price),
    condition: 'new',
    delivery,
    rating: item.rating ?? null,
    reviews: item.reviews ?? null,
    sellerFeedback: null,
  };
}

export function createAmazonProvider() {
  return {
    id: 'amazon',
    name: 'Amazon',
    countries: Object.keys(DOMAINS),
    isConfigured: (env) => Boolean(env.SERPAPI_KEY),

    async search({ q, zip, country }, { env, fetch }) {
      const params = new URLSearchParams({
        engine: 'amazon',
        k: q,
        amazon_domain: DOMAINS[country],
        api_key: env.SERPAPI_KEY,
        ...(LANGUAGES[country] && { language: LANGUAGES[country] }),
        ...(zip && { delivery_zip: zip }),
      });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        if (/hasn't returned any results/i.test(data.error)) return [];
        throw new Error(`Amazon search failed: ${data.error}`);
      }
      if (!res.ok) throw new Error(`Amazon search failed (HTTP ${res.status}).`);
      const { currency } = COUNTRIES[country];
      return (data.organic_results ?? []).map((item) => normalizeAmazonItem(item, currency));
    },
  };
}
