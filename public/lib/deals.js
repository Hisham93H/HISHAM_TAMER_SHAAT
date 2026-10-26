// Ranks and filters offers by what you actually pay: item price plus shipping.
// Shared by the server and the browser.
import { round2 } from './money.js';

const ACCESSORY_TERMS = [
  'case', 'cover', 'skin', 'sticker', 'decal', 'protector', 'tempered glass', 'charger',
  'cable', 'adapter', 'replacement', 'strap', 'band', 'sleeve', 'pouch', 'mount', 'holder',
  'stand', 'dock', 'tips', 'manual', 'box only', 'empty box', 'compatible', 'refill', 'bag',
].map((term) => new RegExp(`\\b${term}s?\\b`, 'i')).concat(
  // Arabic: cover, case, charger, cable, wire, screen protector, stand, box only.
  ['كفر', 'جراب', 'غطاء', 'شاحن', 'كيبل', 'سلك', 'حماية شاشة', 'استاند', 'كرتون فقط'].map((term) => new RegExp(term)),
);

export function isValidOffer(offer) {
  return typeof offer?.title === 'string' && offer.title.trim() !== ''
    && Number.isFinite(offer.price) && offer.price > 0;
}

/** Adds `total` (price + shipping). Offers with unknown shipping get `total: null`. */
export function withTotal(offer) {
  const shipping = Number.isFinite(offer.shipping) && offer.shipping >= 0 ? round2(offer.shipping) : null;
  const price = round2(offer.price);
  return { ...offer, price, shipping, total: shipping == null ? null : round2(price + shipping) };
}

function nullsLast(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

const byTotal = (a, b) => nullsLast(a.total, b.total) || a.price - b.price;
const SORTERS = {
  total: byTotal,
  price: (a, b) => a.price - b.price || byTotal(a, b),
  shipping: (a, b) => nullsLast(a.shipping, b.shipping) || byTotal(a, b),
};

export function sortOffers(offers, by = 'total') {
  return [...offers].sort(SORTERS[by] ?? SORTERS.total);
}

/** Drops unusable offers, adds totals, and puts the cheapest delivered offer first. */
export function rankOffers(offers) {
  return sortOffers(offers.filter(isValidOffer).map(withTotal), 'total');
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hasAccessoryTerm(title, query) {
  return ACCESSORY_TERMS.some((term) => term.test(title) && !term.test(query));
}

/**
 * Listings that are probably not the product being searched for: items sold for parts,
 * prices far below the typical price, and cheap accessories the query didn't ask for.
 */
export function isSuspicious(offer, typicalPrice, query = '') {
  if (offer.condition === 'parts') return true;
  if (typicalPrice == null) return false;
  const ratio = offer.price / typicalPrice;
  return ratio < 0.25 || (ratio < 0.5 && hasAccessoryTerm(offer.title, query));
}

export function filterOffers(offers, filters = {}, query = '') {
  const {
    condition = 'any',
    freeShippingOnly = false,
    includeUnknownShipping = true,
    maxTotal = null,
    smart = true,
    sources = null,
  } = filters;
  const typicalPrice = offers.length >= 4 ? median(offers.map((o) => o.price)) : null;
  return offers.filter((o) =>
    (condition === 'any' || o.condition === condition)
    && (!freeShippingOnly || o.shipping === 0)
    && (includeUnknownShipping || o.shipping != null)
    && (maxTotal == null || (o.total ?? o.price) <= maxTotal)
    && (!sources || sources.has(o.source))
    && (!smart || !isSuspicious(o, typicalPrice, query)));
}

/** The numbers behind the "best deal" card for a list of ranked offers. */
export function summarize(offers) {
  if (!offers.length) return null;
  const priced = offers.filter((o) => o.total != null);
  const best = priced.reduce((min, o) => (!min || o.total < min.total ? o : min), null);
  const lowestSticker = offers.reduce((min, o) => (!min || o.price < min.price ? o : min), null);
  const typicalTotal = median(priced.map((o) => o.total));
  return {
    count: offers.length,
    best,
    lowestSticker,
    typicalTotal,
    savingsVsTypical: best && typicalTotal != null ? round2(typicalTotal - best.total) : null,
    // How much more the lowest sticker price really costs once shipping is added.
    stickerGap: best && lowestSticker.total != null ? round2(lowestSticker.total - best.total) : null,
  };
}
