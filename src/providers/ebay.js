// eBay Browse API. eBay returns the real shipping cost to the buyer's postal code,
// so totals from this source are exact at search time.
// Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
import { COUNTRIES } from '../../public/lib/money.js';

const HOSTS = {
  production: 'https://api.ebay.com',
  sandbox: 'https://api.sandbox.ebay.com',
};
const SCOPE = 'https://api.ebay.com/oauth/api_scope';
const TIMEOUT_MS = 10_000;

export function ebayCondition(conditionId, conditionText = '') {
  const id = Number(conditionId);
  if (id >= 1000 && id < 2000) return 'new';
  if (id >= 2000 && id < 2750) return 'refurbished';
  if (id >= 2750 && id < 7000) return 'used';
  if (id === 7000) return 'parts';
  const text = String(conditionText).toLowerCase();
  if (/parts|not working/.test(text)) return 'parts';
  if (/refurb/.test(text)) return 'refurbished';
  if (/used|pre-owned|like new|good|acceptable/.test(text)) return 'used';
  if (/new/.test(text)) return 'new';
  return 'unknown';
}

function cheapestShipping(options) {
  let best = null;
  for (const option of options ?? []) {
    const cost = Number(option.shippingCost?.value);
    if (option.shippingCost?.value != null && Number.isFinite(cost) && (!best || cost < best.cost)) {
      best = { cost, option };
    }
  }
  return best ?? { cost: null, option: options?.[0] ?? null };
}

function deliveryWindow(option, locale) {
  const min = option?.minEstimatedDeliveryDate;
  const max = option?.maxEstimatedDeliveryDate;
  if (!min && !max) return null;
  const format = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const from = format.format(new Date(min ?? max));
  const to = max ? format.format(new Date(max)) : from;
  return from === to ? `Arrives ${from}` : `Arrives ${from} – ${to}`;
}

export function normalizeEbayItem(item, locale = 'en-US') {
  const shipping = cheapestShipping(item.shippingOptions);
  const feedback = item.seller?.feedbackPercentage;
  return {
    id: `ebay:${item.itemId}`,
    title: item.title,
    url: item.itemWebUrl ?? null,
    image: item.image?.imageUrl ?? item.thumbnailImages?.[0]?.imageUrl ?? null,
    source: 'ebay',
    sourceName: 'eBay',
    seller: item.seller?.username ?? 'eBay seller',
    price: Number(item.price?.value),
    currency: item.price?.currency ?? null,
    shipping: shipping.cost,
    condition: ebayCondition(item.conditionId, item.condition),
    delivery: deliveryWindow(shipping.option, locale),
    rating: null,
    reviews: null,
    sellerFeedback: feedback ? `${feedback}% positive` : null,
  };
}

export function createEbayProvider() {
  let token = null;

  async function accessToken(env, fetch, host) {
    if (token && token.clientId === env.EBAY_CLIENT_ID && token.expiresAt > Date.now() + 60_000) {
      return token.value;
    }
    const credentials = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${host}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${credentials}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPE }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`eBay sign-in failed (HTTP ${res.status}). Check EBAY_CLIENT_ID and EBAY_CLIENT_SECRET.`);
    }
    const data = await res.json();
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000, clientId: env.EBAY_CLIENT_ID };
    return token.value;
  }

  return {
    id: 'ebay',
    name: 'eBay',
    isConfigured: (env) => Boolean(env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET),

    async search({ q, zip, country }, { env, fetch }) {
      const host = env.EBAY_ENV === 'sandbox' ? HOSTS.sandbox : HOSTS.production;
      const bearer = await accessToken(env, fetch, host);
      const params = new URLSearchParams({
        q,
        limit: '100',
        filter: `buyingOptions:{FIXED_PRICE},deliveryCountry:${country}`,
      });
      // Tells eBay where the buyer is, so shipping costs are calculated for that address.
      const location = zip ? `country=${country},zip=${zip}` : `country=${country}`;
      const res = await fetch(`${host}/buy/browse/v1/item_summary/search?${params}`, {
        headers: {
          authorization: `Bearer ${bearer}`,
          accept: 'application/json',
          'x-ebay-c-marketplace-id': `EBAY_${country}`,
          'x-ebay-c-enduserctx': `contextualLocation=${encodeURIComponent(location)}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401) token = null;
      if (!res.ok) throw new Error(`eBay search failed (HTTP ${res.status}).`);
      const data = await res.json();
      const { locale } = COUNTRIES[country];
      return (data.itemSummaries ?? []).map((item) => normalizeEbayItem(item, locale));
    },
  };
}
