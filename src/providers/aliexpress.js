// AliExpress through its official Affiliate API (free; needs an app key and secret from
// the AliExpress Open Platform). Results only include items that ship to the buyer's
// country. The API doesn't return shipping costs, so shipping is left unknown.
// Docs: https://openservice.aliexpress.com (method aliexpress.affiliate.product.query)
import { createHash } from 'node:crypto';
import { round2 } from '../../public/lib/money.js';
import { COUNTRIES } from '../../public/lib/places.js';

const GATEWAY = 'https://api-sg.aliexpress.com/sync';
const TIMEOUT_MS = 10_000;
// AliExpress doesn't price in riyals, so Saudi prices are asked for in dollars and
// converted at the riyal's fixed peg of 3.75 per dollar.
const PEGGED = { SAR: { from: 'USD', rate: 3.75 } };
// AliExpress writes the United Kingdom as UK.
const SHIP_TO = { GB: 'UK' };

/** MD5 signature: secret + every parameter as key+value, sorted by key + secret. */
export function signAliExpress(params, secret) {
  const joined = Object.keys(params).sort().map((key) => `${key}${params[key]}`).join('');
  return createHash('md5').update(`${secret}${joined}${secret}`, 'utf8').digest('hex').toUpperCase();
}

export function normalizeAliExpressProduct(product, currency) {
  const peg = PEGGED[currency];
  const price = Number(product.target_sale_price ?? product.sale_price);
  return {
    id: `aliexpress:${product.product_id}`,
    title: product.product_title,
    url: product.promotion_link || product.product_detail_url || null,
    image: product.product_main_image_url ?? null,
    source: 'aliexpress',
    sourceName: 'AliExpress',
    seller: 'AliExpress seller',
    price: peg ? round2(price * peg.rate) : price,
    currency,
    shipping: null,
    condition: 'new',
    delivery: 'Shipping shown at AliExpress checkout',
    rating: null,
    reviews: null,
    sellerFeedback: product.evaluate_rate ? `${product.evaluate_rate} positive` : null,
  };
}

export function createAliExpressProvider() {
  return {
    id: 'aliexpress',
    name: 'AliExpress',
    countries: Object.keys(COUNTRIES),
    isConfigured: (env) => Boolean(env.ALIEXPRESS_APP_KEY && env.ALIEXPRESS_APP_SECRET),

    async search({ q, country }, { env, fetch, now = Date.now }) {
      const { currency } = COUNTRIES[country];
      const business = {
        keywords: q,
        ship_to_country: SHIP_TO[country] ?? country,
        target_currency: PEGGED[currency]?.from ?? currency,
        target_language: 'EN',
        page_size: '50',
        ...(env.ALIEXPRESS_TRACKING_ID && { tracking_id: env.ALIEXPRESS_TRACKING_ID }),
      };
      const system = {
        app_key: env.ALIEXPRESS_APP_KEY,
        method: 'aliexpress.affiliate.product.query',
        sign_method: 'md5',
        timestamp: String(now()),
        format: 'json',
        v: '2.0',
      };
      const sign = signAliExpress({ ...system, ...business }, env.ALIEXPRESS_APP_SECRET);
      const res = await fetch(`${GATEWAY}?${new URLSearchParams({ ...system, sign })}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', accept: 'application/json' },
        body: new URLSearchParams(business).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      const failure = body?.error_response;
      if (failure) throw new Error(`AliExpress search failed: ${failure.sub_msg || failure.msg || failure.code}.`);
      const result = body?.aliexpress_affiliate_product_query_response?.resp_result;
      if (!result) throw new Error(`AliExpress search failed (HTTP ${res.status}).`);
      if (Number(result.resp_code) !== 200) {
        if (/empty|no result/i.test(result.resp_msg ?? '')) return [];
        throw new Error(`AliExpress search failed: ${result.resp_msg ?? `code ${result.resp_code}`}.`);
      }
      return (result.result?.products?.product ?? []).map((p) => normalizeAliExpressProduct(p, currency));
    },
  };
}
