// Searches a set of price sources at once and merges their offers into one ranked
// result. Shared by the server and by the browser (when the site runs without a server).
import { COUNTRIES } from './places.js';
import { rankOffers } from './deals.js';

function dedupeByUrl(offers) {
  const seen = new Set();
  return offers.filter((offer) => {
    if (!offer.url) return true;
    if (seen.has(offer.url)) return false;
    seen.add(offer.url);
    return true;
  });
}

export async function searchSources(providers, { q, zip = '', city = '', country }, context) {
  const { currency } = COUNTRIES[country];
  const settled = await Promise.allSettled(providers.map((p) => p.search({ q, zip, city, country }, context)));
  // Offers in another currency can't be compared fairly, so they are left out.
  const offers = dedupeByUrl(rankOffers(settled.flatMap((r) =>
    r.status === 'fulfilled' ? r.value.filter((o) => o.currency === currency) : [])));
  const sources = settled.map((r, i) => ({
    id: providers[i].id,
    name: providers[i].name,
    ok: r.status === 'fulfilled',
    count: offers.filter((o) => o.source === providers[i].id).length,
    ...(r.status === 'rejected' && { error: r.reason?.message ?? 'Unknown error' }),
  }));
  return { query: q, zip, city, country, currency, demo: false, sources, offers, fetchedAt: new Date().toISOString() };
}
