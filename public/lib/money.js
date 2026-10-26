// Money helpers shared by the server and the browser.

export const COUNTRIES = {
  US: { name: 'United States', currency: 'USD', locale: 'en-US', postal: 'ZIP code' },
  CA: { name: 'Canada', currency: 'CAD', locale: 'en-CA', postal: 'Postal code' },
  GB: { name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', postal: 'Postcode' },
  AU: { name: 'Australia', currency: 'AUD', locale: 'en-AU', postal: 'Postcode' },
  DE: { name: 'Germany', currency: 'EUR', locale: 'de-DE', postal: 'Postleitzahl' },
  FR: { name: 'France', currency: 'EUR', locale: 'fr-FR', postal: 'Code postal' },
  IT: { name: 'Italy', currency: 'EUR', locale: 'it-IT', postal: 'CAP' },
  ES: { name: 'Spain', currency: 'EUR', locale: 'es-ES', postal: 'Código postal' },
};

const CURRENCY_MARK = '(?:US\\$|CA\\$|C\\$|AU\\$|A\\$|\\$|£|€|USD|CAD|AUD|GBP|EUR)';
const AMOUNT = '(\\d[\\d.,]*\\d|\\d)';
const MARKED_AMOUNT = new RegExp(`${CURRENCY_MARK}\\s?${AMOUNT}|${AMOUNT}\\s?${CURRENCY_MARK}`, 'i');
const FREE = /\bfree\b|kostenlos|gratuit|gratis/;
const FREE_RETURNS = /free\s+(?:\d+[- ]day\s+)?returns?/g;

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Converts "1,299.99", "1.299,99", "4,99" or "1.299" to a number. */
export function toNumber(raw) {
  let s = String(raw).replace(/[\s  ]/g, '');
  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');
  if (comma > -1 && dot > -1) {
    // Whichever separator comes last is the decimal point.
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (comma > -1) {
    s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (dot > -1 && !/^\d+\.\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function markedAmount(text) {
  const match = text.match(MARKED_AMOUNT);
  return match ? toNumber(match[1] ?? match[2]) : null;
}

/** Reads a price from a number or from text such as "$1,299.99" or "4,99 €". */
export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const marked = markedAmount(value);
  if (marked != null) return marked;
  const bare = value.match(/\d[\d.,]*\d|\d/);
  return bare ? toNumber(bare[0]) : null;
}

/**
 * Reads a shipping cost from text such as "Free delivery", "$5.99 delivery" or
 * "Free shipping on orders over $35". Returns null when the cost can't be known.
 */
export function parseShipping(value, itemPrice = null) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value).toLowerCase().replace(FREE_RETURNS, '');
  if (FREE.test(text)) {
    // An amount next to "free" is a minimum order, not a fee.
    const minimum = markedAmount(text);
    if (minimum == null) return 0;
    return itemPrice != null && itemPrice >= minimum ? 0 : null;
  }
  return markedAmount(text);
}
