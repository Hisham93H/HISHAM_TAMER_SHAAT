// noon (noon.com), Saudi Arabia's Amazon-style store for new items. noon has no public
// API, so this calls the same catalog search the noon.com website uses, asking for the
// Saudi store. noon blocks most requests from cloud servers; it answers reliably only
// when Hisham's Tool runs on a home or office connection, ideally in Saudi Arabia.
// Search results don't include noon's delivery fee (it depends on the order total,
// noon Express and noon One membership), so shipping is left unknown.
const ENDPOINT = 'https://www.noon.com/_svc/catalog/api/v3/u/search';
const STORE_URL = 'https://www.noon.com/saudi-en';
const IMAGE_CDN = 'https://f.nooncdn.com/p';
const TIMEOUT_MS = 10_000;
const BLOCKED_HINT = 'noon often blocks cloud servers; it works best when Hisham’s Tool runs on a computer in Saudi Arabia.';

function noonCondition(name) {
  if (/renewed|refurbished/i.test(name)) return 'refurbished';
  if (/pre-?owned|\bused\b/i.test(name)) return 'used';
  return 'new';
}

export function normalizeNoonHit(hit) {
  const image = hit.image_url ?? (hit.image_key ? `${IMAGE_CDN}/${hit.image_key}.jpg` : null);
  return {
    id: `noon:${hit.sku}`,
    title: hit.name,
    url: hit.url && hit.sku ? `${STORE_URL}/${hit.url}/${hit.sku}/p/` : null,
    image,
    source: 'noon',
    sourceName: 'noon',
    seller: hit.store_name || 'noon',
    price: Number(hit.sale_price ?? hit.price),
    currency: 'SAR',
    shipping: null,
    condition: noonCondition(hit.name ?? ''),
    delivery: 'Delivery fee shown at noon checkout',
    rating: hit.product_rating?.value ?? null,
    reviews: hit.product_rating?.count ?? null,
    sellerFeedback: null,
  };
}

export function createNoonProvider() {
  return {
    id: 'noon',
    name: 'noon',
    countries: ['SA'],
    isConfigured: () => true,

    async search({ q }, { fetch }) {
      let res;
      try {
        res = await fetch(`${ENDPOINT}?${new URLSearchParams({ q })}`, {
          headers: { accept: 'application/json', 'x-locale': 'en-sa', 'x-mp': 'noon' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new Error(`noon didn’t answer. ${BLOCKED_HINT}`);
      }
      if (!res.ok) throw new Error(`noon refused the request (HTTP ${res.status}). ${BLOCKED_HINT}`);
      const body = await res.json().catch(() => null);
      if (!Array.isArray(body?.hits)) {
        throw new Error(`noon sent back something other than search results. ${BLOCKED_HINT}`);
      }
      return body.hits.filter((hit) => hit.is_buyable !== false).map(normalizeNoonHit);
    },
  };
}
