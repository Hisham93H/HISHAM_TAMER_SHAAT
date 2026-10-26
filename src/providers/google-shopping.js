// Google Shopping results through SerpAPI. Google lists offers from many stores
// (Amazon, Walmart, Best Buy and smaller shops; in Saudi Arabia, whichever local
// stores list there). Shipping comes from the listing's delivery text, e.g.
// "Free delivery" or "$5.99 delivery".
// Docs: https://serpapi.com/google-shopping-api
import { parseMoney, parseShipping } from '../../public/lib/money.js';
import { COUNTRIES } from '../../public/lib/places.js';

const TIMEOUT_MS = 15_000;

function googleCondition(secondHand) {
  if (!secondHand) return 'new';
  const text = String(secondHand).toLowerCase();
  if (/refurb|renewed/.test(text)) return 'refurbished';
  if (/parts/.test(text)) return 'parts';
  return 'used';
}

export function normalizeGoogleItem(item, currency) {
  const price = item.extracted_price ?? parseMoney(item.price);
  return {
    id: `google:${item.product_id ?? item.position}`,
    title: item.title,
    url: item.link ?? item.product_link ?? null,
    image: item.thumbnail ?? null,
    source: 'google',
    sourceName: 'Google Shopping',
    seller: item.source ?? 'Online store',
    price,
    currency,
    shipping: parseShipping(item.delivery, price),
    condition: googleCondition(item.second_hand_condition),
    delivery: item.delivery ?? null,
    rating: item.rating ?? null,
    reviews: item.reviews ?? null,
    sellerFeedback: null,
  };
}

export function createGoogleShoppingProvider() {
  return {
    id: 'google',
    name: 'Google Shopping',
    countries: Object.keys(COUNTRIES),
    isConfigured: (env) => Boolean(env.SERPAPI_KEY),

    async search({ q, country }, { env, fetch }) {
      const params = new URLSearchParams({
        engine: 'google_shopping',
        q,
        gl: country.toLowerCase(),
        hl: 'en',
        api_key: env.SERPAPI_KEY,
      });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        if (/hasn't returned any results/i.test(data.error)) return [];
        throw new Error(`Google Shopping search failed: ${data.error}`);
      }
      if (!res.ok) throw new Error(`Google Shopping search failed (HTTP ${res.status}).`);
      const { currency } = COUNTRIES[country];
      return (data.shopping_results ?? []).map((item) => normalizeGoogleItem(item, currency));
    },
  };
}
