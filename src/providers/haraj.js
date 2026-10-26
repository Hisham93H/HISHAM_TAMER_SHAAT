// Haraj (haraj.com.sa), Saudi Arabia's largest classifieds site. Listings are mostly
// used items sold by individuals, who hand them over in person, so there is no
// shipping fee: a listing in the buyer's own city counts as free local pickup, and
// one in another city has unknown shipping. Listings without a price are skipped
// later by the ranking, because their sellers expect offers instead.
// Uses the public GraphQL endpoint that the haraj.com.sa website itself calls.
import { findCity } from '../../public/lib/places.js';

const ENDPOINT = 'https://graphql.haraj.com.sa/?queryName=Search&lang=ar';
const TIMEOUT_MS = 10_000;
const SEARCH_QUERY = `query Search($search: String!, $page: Int, $limit: Int) {
  search(search: $search, page: $page, limit: $limit) {
    items { id title URL city authorUsername status price { inputPrice } imagesList }
  }
}`;

// Haraj spells some cities several ways (جده / جدة, أبها / ابها).
function normalizeArabic(text) {
  return String(text ?? '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .trim();
}

export function harajCondition(title) {
  if (/شبه جديد|like new|مستعمل|used/i.test(title)) return 'used';
  if (/جديد|مختوم|بكرتونه|\bnew\b|sealed/i.test(title)) return 'new';
  return 'used';
}

export function normalizeHarajPost(post, buyerCity = null) {
  const local = buyerCity != null && normalizeArabic(post.city) === normalizeArabic(buyerCity.haraj);
  return {
    id: `haraj:${post.id}`,
    title: post.title,
    url: post.URL ? new URL(post.URL, 'https://haraj.com.sa/').href : null,
    image: post.imagesList?.find((src) => src.startsWith('https://')) ?? null,
    source: 'haraj',
    sourceName: 'Haraj',
    seller: post.authorUsername || 'Haraj seller',
    price: Number(post.price?.inputPrice),
    currency: 'SAR',
    shipping: local ? 0 : null,
    pickup: true,
    condition: harajCondition(post.title),
    delivery: local ? `Pickup in ${buyerCity.name}` : `Seller is in ${post.city || 'another city'}: pick up or arrange delivery`,
    rating: null,
    reviews: null,
    sellerFeedback: null,
  };
}

export function createHarajProvider() {
  return {
    id: 'haraj',
    name: 'Haraj',
    countries: ['SA'],
    isConfigured: () => true,

    async search({ q, city }, { fetch }) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          origin: 'https://haraj.com.sa',
          referer: 'https://haraj.com.sa/',
        },
        body: JSON.stringify({ query: SEARCH_QUERY, variables: { search: q, page: 1, limit: 60 } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Haraj search failed (HTTP ${res.status}).`);
      const body = await res.json();
      const items = body.data?.search?.items;
      if (!Array.isArray(items)) {
        throw new Error(`Haraj search failed: ${body.errors?.[0]?.message ?? 'unexpected response'}.`);
      }
      const buyerCity = findCity('SA', city);
      return items.filter((post) => post.status !== false).map((post) => normalizeHarajPost(post, buyerCity));
    },
  };
}
