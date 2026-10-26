import { CITIES, COUNTRIES, DEFAULT_COUNTRY, describeLocation, findCity } from './lib/places.js';
import { filterOffers, sortOffers, summarize } from './lib/deals.js';
import { demoResult } from './lib/demo.js';
import { createHarajProvider } from './lib/haraj.js';
import { searchSources } from './lib/sources.js';

const EXAMPLE_QUERY = 'wireless earbuds';
// Sources the browser can search by itself when the site runs without its server
// (e.g. on GitHub Pages). Haraj allows this; noon and the keyed APIs don't.
const BROWSER_SOURCES = { SA: [createHarajProvider()] };
// Set on copies of the page that can't search live (the claude.ai preview), to point
// visitors to the live site.
const LIVE_URL = document.querySelector('meta[name="hishams-tool:live-url"]')?.content;
const DEFAULT_FILTERS = {
  sort: 'total',
  condition: 'any',
  maxTotal: null,
  freeShippingOnly: false,
  includeUnknownShipping: true,
  smart: true,
};
const CONDITION_LABELS = { new: 'New', used: 'Used', refurbished: 'Refurbished', parts: 'For parts' };

const $ = (selector) => document.querySelector(selector);
const els = {
  form: $('#search'),
  q: $('#q'),
  zip: $('#zip'),
  zipField: $('#zip-field'),
  city: $('#city'),
  cityField: $('#city-field'),
  country: $('#country'),
  mode: $('#mode'),
  notices: $('#notices'),
  status: $('#status'),
  best: $('#best'),
  insight: $('#insight'),
  offers: $('#offers'),
  hiddenNote: $('#hidden-note'),
  filtersPanel: $('#filters-panel'),
  sort: $('#sort'),
  maxTotal: $('#max-total'),
  freeOnly: $('#free-only'),
  includeUnknown: $('#include-unknown'),
  smart: $('#smart'),
  sourcesGroup: $('#sources-group'),
  sources: $('#sources'),
  reset: $('#reset-filters'),
};

const state = {
  backend: null, // server status, or false when the page runs without its server
  result: null,
  example: false,
  loading: false,
  error: null,
  filters: { ...DEFAULT_FILTERS },
  hiddenSources: new Set(),
  requestId: 0,
};

const storage = {
  get(key) {
    try { return localStorage.getItem(`hishams-tool:${key}`); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(`hishams-tool:${key}`, value); } catch { /* storage unavailable */ }
  },
};

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) el.append(child);
  }
  return el;
}

function safeUrl(value, protocols = ['https:', 'http:']) {
  try {
    const url = new URL(value);
    return protocols.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const formatters = new Map();
function money(amount, currency = state.result?.currency ?? 'USD') {
  const locale = COUNTRIES[state.result?.country]?.locale ?? 'en-US';
  const key = `${locale}|${currency}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.NumberFormat(locale, { style: 'currency', currency }));
  return formatters.get(key).format(amount);
}

const count = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

// Data

async function detectBackend() {
  try {
    const res = await fetch('api/status', { headers: { accept: 'application/json' } });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return false;
    return await res.json();
  } catch {
    return false;
  }
}

async function fetchResult(params) {
  let res;
  try {
    res = await fetch(`api/search?${new URLSearchParams(params)}`, { headers: { accept: 'application/json' } });
  } catch {
    throw new Error('Couldn’t reach the Hisham’s Tool server. Check your connection and try again.');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(body?.error ?? `The server answered with an error (HTTP ${res.status}). Try again.`);
  return body;
}

const backendReady = detectBackend().then((backend) => {
  state.backend = backend;
  renderMode();
});

// Where to ship to: a city where the country has a city list, otherwise a postal code.
function shipTo() {
  const country = els.country.value;
  return CITIES[country]
    ? { country, zip: '', city: els.city.value }
    : { country, zip: els.zip.value.trim(), city: '' };
}

function liveSourceNames(country) {
  return state.backend
    ? state.backend.sources.filter((s) => s.configured && s.countries.includes(country)).map((s) => s.name)
    : (BROWSER_SOURCES[country] ?? []).map((p) => p.name);
}

// Without a server: search what the browser can reach, and fall back to sample data
// (keeping the failure notices) when none of it answers.
async function browserSearch({ q, zip = '', city = '', country }) {
  const providers = BROWSER_SOURCES[country];
  if (!providers) return demoResult(q, country, zip, city);
  const result = await searchSources(providers, { q, zip, city, country }, { fetch: (...args) => fetch(...args) });
  if (result.sources.some((s) => s.ok)) return result;
  const demo = demoResult(q, country, zip, city);
  return { ...demo, sources: [...result.sources, ...demo.sources] };
}

async function search() {
  const q = els.q.value.trim().replace(/\s+/g, ' ');
  if (!q) {
    els.q.focus();
    return;
  }
  const { country, zip, city } = shipTo();
  storage.set('country', country);
  if (CITIES[country]) storage.set('city', city);
  else storage.set('zip', zip);
  const params = CITIES[country] ? { q, city, country } : { q, zip, country };
  try {
    history.replaceState(null, '', `?${new URLSearchParams(params)}`);
  } catch { /* the address can't change here */ }

  const id = ++state.requestId;
  Object.assign(state, { loading: true, error: null, example: false });
  render();
  try {
    await backendReady;
    const result = state.backend ? await fetchResult(params) : await browserSearch(params);
    if (id !== state.requestId) return;
    state.result = result;
    state.hiddenSources.clear();
  } catch (err) {
    if (id !== state.requestId) return;
    state.error = err.message;
  }
  state.loading = false;
  render();
}

function showExample() {
  const { country, zip, city } = shipTo();
  state.example = true;
  state.result = demoResult(EXAMPLE_QUERY, country, zip, city);
  render();
}

// Rendering

function renderMode() {
  const live = liveSourceNames(els.country.value);
  els.mode.textContent = live.length ? `Live · ${live.join(' + ')}` : 'Demo data';
  els.mode.classList.toggle('is-live', live.length > 0);
  render();
}

function liveLink() {
  const url = LIVE_URL && safeUrl(LIVE_URL, ['https:']);
  return url ? [' ', h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Open the live version'), '.'] : [];
}

function renderNotices() {
  const notes = [];
  const result = state.result;
  const countryName = COUNTRIES[result?.country]?.name ?? result?.country;
  if (state.example) {
    notes.push(h('p', { class: 'notice' },
      h('strong', null, 'Example search. '),
      `These results for “${EXAMPLE_QUERY}” are sample offers from fictional stores. Search for any product above.`,
      ...liveLink()));
  } else if (result?.demo && !state.loading) {
    let why;
    if (state.backend) {
      why = `No live price source covers ${countryName} on this server yet, so these offers come from fictional stores. Add eBay or SerpAPI keys to the .env file to compare live prices.`;
    } else if (BROWSER_SOURCES[result.country]) {
      why = 'Live search didn’t answer, so these are sample offers from fictional stores.';
    } else {
      why = `Live prices for ${countryName} need the Hisham’s Tool server with eBay or Google Shopping keys, so these offers come from fictional stores.`;
    }
    notes.push(h('p', { class: 'notice is-warning' }, h('strong', null, 'Sample data. '), why, ...liveLink()));
  } else if (result && !state.backend && !state.loading && result.country === 'SA') {
    notes.push(h('p', { class: 'notice' },
      h('strong', null, 'noon isn’t included here. '),
      'noon blocks searches from other websites, so it only works when Hisham’s Tool runs as a server on a computer in Saudi Arabia.'));
  }
  if (!state.loading && !state.example) {
    for (const source of result?.sources ?? []) {
      if (!source.ok) {
        notes.push(h('p', { class: 'notice is-warning' }, h('strong', null, `${source.name} couldn’t be searched. `), source.error));
      }
    }
  }
  if (state.error && !state.loading) {
    notes.push(h('p', { class: 'notice is-error' }, h('strong', null, 'Search failed. '), state.error));
  }
  els.notices.replaceChildren(...notes);
}

function renderSourceFilters() {
  const sources = (state.result?.sources ?? []).filter((s) => s.ok && s.count > 0);
  els.sourcesGroup.hidden = sources.length < 2;
  els.sources.replaceChildren(...sources.map((source) => h('label', { class: 'check' },
    h('input', {
      type: 'checkbox',
      id: `source-${source.id}`,
      checked: !state.hiddenSources.has(source.id),
      onchange: (event) => {
        state.hiddenSources[event.target.checked ? 'delete' : 'add'](source.id);
        render();
      },
    }),
    ` ${source.name} (${source.count})`)));
}

function thumb(offer) {
  const image = safeUrl(offer.image, ['https:']);
  const initials = offer.seller.match(/\b[a-z0-9]/gi)?.slice(0, 2).join('').toUpperCase() ?? '?';
  const placeholder = () => h('div', { class: 'thumb thumb-placeholder', 'aria-hidden': 'true' }, initials);
  if (!image) return placeholder();
  const img = h('img', { class: 'thumb', src: image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
  return img;
}

function titleNode(offer, className) {
  const url = safeUrl(offer.url);
  // dir="auto" lets Arabic titles from noon and Haraj read right to left.
  return url
    ? h('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer', dir: 'auto' }, offer.title)
    : h('span', { class: className, dir: 'auto' }, offer.title);
}

function dealLink(offer, className, label) {
  const url = safeUrl(offer.url);
  if (!url) return h('span', { class: 'sample-tag' }, 'Sample listing');
  return h('a', {
    class: className,
    href: url,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': `${label} at ${offer.seller} (opens in a new tab)`,
  }, label);
}

function shippingText(offer) {
  if (offer.shipping == null) return 'Unknown';
  if (offer.shipping === 0) return offer.pickup ? 'Pickup' : 'Free';
  return `+${money(offer.shipping, offer.currency)}`;
}

function meta(offer) {
  const rating = offer.rating != null
    ? `★ ${offer.rating}${offer.reviews ? ` (${offer.reviews.toLocaleString()})` : ''}`
    : offer.sellerFeedback;
  return h('div', { class: 'meta' },
    h('span', { class: 'seller', dir: 'auto' }, offer.seller),
    offer.source !== 'demo' && h('span', null, offer.sourceName),
    CONDITION_LABELS[offer.condition] && h('span', { class: 'chip' }, CONDITION_LABELS[offer.condition]),
    offer.shipping === 0 && h('span', { class: 'chip is-free' }, offer.pickup ? 'Local pickup' : 'Free shipping'),
    offer.shipping == null && h('span', { class: 'chip is-unknown' }, 'Shipping unknown'),
    rating && h('span', null, rating),
    offer.delivery && h('span', null, offer.delivery));
}

function renderBest(summary) {
  // With no known delivered price (e.g. only noon and out-of-town Haraj offers), show
  // the lowest price instead and say that shipping still has to be added.
  const best = summary?.best ?? summary?.lowestSticker;
  els.best.hidden = !best;
  if (!best) return els.best.replaceChildren();
  const known = best.total != null;
  const savings = known && summary.savingsVsTypical > 0
    ? h('p', { class: 'best-savings' },
      h('strong', null, `${money(summary.savingsVsTypical)} less`),
      ` than the typical delivered price of ${money(summary.typicalTotal)} across ${count(summary.count, 'offer')}.`)
    : null;
  const heading = known ? 'Cheapest delivered' : 'Lowest price · shipping not listed';
  els.best.replaceChildren(h('article', { class: 'best', 'aria-label': heading },
    h('div', { class: 'best-main' },
      h('div', { class: 'eyebrow' }, heading),
      h('div', { class: 'best-product' },
        thumb(best),
        h('div', null,
          h('h3', { class: 'best-title' }, titleNode(best)),
          meta(best))),
      savings),
    h('div', { class: 'best-side' },
      h('dl', { class: 'receipt' },
        h('div', null, h('dt', null, 'Item price'), h('dd', null, money(best.price, best.currency))),
        h('div', null, h('dt', null, 'Shipping'),
          h('dd', { class: best.shipping === 0 ? 'is-free' : null }, shippingText(best))),
        known
          ? h('div', { class: 'is-total' }, h('dt', null, 'You pay'), h('dd', null, money(best.total, best.currency)))
          : h('div', { class: 'is-total' }, h('dt', null, 'You pay'),
            h('dd', null, money(best.price, best.currency), h('small', null, ' + shipping')))),
      !known && best.delivery && h('p', { class: 'best-delivery' }, best.delivery),
      dealLink(best, 'btn-deal', 'Go to deal'))));
}

function renderInsight(summary) {
  const { best, lowestSticker: low } = summary ?? {};
  let message = null;
  if (best && low && summary.stickerGap > 0) {
    message = [
      'The lowest sticker price is ', h('strong', null, money(low.price)), ` at ${low.seller}, but `,
      h('strong', null, money(low.shipping)), ' shipping brings it to ', h('strong', null, money(low.total)),
      `. That’s ${money(summary.stickerGap)} more than the cheapest delivered deal.`,
    ];
  } else if (best && low && low !== best && low.total == null) {
    message = [
      'The lowest sticker price, ', h('strong', null, money(low.price)), ` at ${low.seller}, doesn’t list shipping, `,
      'so it isn’t ranked as the best deal. Check its checkout total before you buy.',
    ];
  }
  els.insight.hidden = !message;
  els.insight.replaceChildren(...(message ?? []));
}

function renderOffers(visible, summary) {
  if (!visible.length) {
    const total = state.result.offers.length;
    els.offers.replaceChildren(h('li', { class: 'empty' },
      h('strong', null, total ? 'No offers match these filters' : `No offers found for “${state.result.query}”`),
      total ? 'Loosen a filter, or reset them all.' : 'Try fewer or different words.'));
    return;
  }
  const scale = Math.max(...visible.map((o) => o.total ?? o.price));
  els.offers.replaceChildren(...visible.map((offer, index) => {
    const isBest = offer === summary.best;
    const itemBar = h('span', { class: 'bar-item' });
    const shipBar = h('span', { class: 'bar-ship' });
    itemBar.style.width = `${(offer.price / scale) * 100}%`;
    shipBar.style.width = `${((offer.shipping ?? 0) / scale) * 100}%`;
    const shipClass = offer.shipping == null ? ' is-unknown' : offer.shipping === 0 ? ' is-free' : '';
    return h('li', { class: `offer${isBest ? ' is-best' : ''}` },
      h('span', { class: 'rank' }, String(index + 1)),
      thumb(offer),
      h('div', { class: 'offer-body' },
        titleNode(offer, 'offer-title'),
        meta(offer),
        h('div', { class: 'bar', 'aria-hidden': 'true' }, itemBar, shipBar)),
      h('div', { class: 'offer-price' },
        h('span', { class: 'price-line' }, h('span', { class: 'lbl' }, 'Item'), h('span', null, money(offer.price, offer.currency))),
        h('span', { class: `price-line${shipClass}` }, h('span', { class: 'lbl' }, 'Ship'), h('span', null, shippingText(offer))),
        h('span', { class: 'price-line total' }, h('span', { class: 'lbl' }, 'Total'),
          h('span', null, offer.total == null ? '—' : money(offer.total, offer.currency))),
        dealLink(offer, 'btn-view', 'View deal')));
  }));
}

function renderHiddenNote(hidden) {
  els.hiddenNote.hidden = hidden === 0;
  els.hiddenNote.replaceChildren(
    `${count(hidden, 'offer')} hidden by your filters. `,
    h('button', { type: 'button', class: 'btn-link', onclick: resetFilters }, 'Show all'));
}

function renderLoading() {
  const names = liveSourceNames(els.country.value);
  els.status.textContent = names.length ? `Searching ${names.join(' and ')}…` : 'Searching…';
  els.best.hidden = true;
  els.insight.hidden = true;
  els.hiddenNote.hidden = true;
  els.offers.replaceChildren(...Array.from({ length: 4 }, () => h('li', { class: 'skeleton', 'aria-hidden': 'true' })));
}

function render() {
  renderNotices();
  renderSourceFilters();
  if (state.loading) return renderLoading();
  const result = state.result;
  if (!result || state.error) {
    els.status.textContent = '';
    els.best.hidden = true;
    els.insight.hidden = true;
    els.hiddenNote.hidden = true;
    els.offers.replaceChildren();
    return;
  }
  const present = new Set(result.offers.map((o) => o.source));
  const sources = state.hiddenSources.size
    ? new Set([...present].filter((id) => !state.hiddenSources.has(id)))
    : null;
  const visible = sortOffers(filterOffers(result.offers, { ...state.filters, sources }, result.query), state.filters.sort);
  const summary = summarize(visible);
  els.status.replaceChildren(
    h('strong', null, count(visible.length, 'offer')),
    ` for “${result.query}”, shipping to ${describeLocation(result)}.`);
  renderBest(summary);
  renderInsight(summary);
  renderOffers(visible, summary ?? {});
  renderHiddenNote(result.offers.length - visible.length);
}

// Controls

function readFilters() {
  const max = Number.parseFloat(els.maxTotal.value);
  state.filters = {
    sort: els.sort.value,
    condition: $('input[name="condition"]:checked')?.value ?? 'any',
    maxTotal: Number.isFinite(max) && max > 0 ? max : null,
    freeShippingOnly: els.freeOnly.checked,
    includeUnknownShipping: els.includeUnknown.checked,
    smart: els.smart.checked,
  };
  render();
}

function resetFilters() {
  els.sort.value = DEFAULT_FILTERS.sort;
  $(`#cond-${DEFAULT_FILTERS.condition}`).checked = true;
  els.maxTotal.value = '';
  els.freeOnly.checked = DEFAULT_FILTERS.freeShippingOnly;
  els.includeUnknown.checked = DEFAULT_FILTERS.includeUnknownShipping;
  els.smart.checked = DEFAULT_FILTERS.smart;
  state.hiddenSources.clear();
  readFilters();
}

// Shows a city list for countries that have one, and a postal code box elsewhere.
function updateLocationField(preferredCity = els.city.value) {
  const country = els.country.value;
  const cities = CITIES[country];
  els.cityField.hidden = !cities;
  els.zipField.hidden = Boolean(cities);
  els.zip.placeholder = COUNTRIES[country]?.postal ?? 'Postal code';
  if (cities) {
    els.city.replaceChildren(
      h('option', { value: '' }, 'Any city'),
      ...cities.map((city) => h('option', { value: city.id }, city.name)));
    els.city.value = findCity(country, preferredCity) ? preferredCity : '';
  }
}

function init() {
  for (const [code, country] of Object.entries(COUNTRIES)) {
    els.country.append(h('option', { value: code }, country.name));
  }
  const params = new URLSearchParams(location.search);
  const country = [params.get('country'), storage.get('country')]
    .map((c) => c?.toUpperCase())
    .find((c) => c && Object.hasOwn(COUNTRIES, c));
  els.country.value = country ?? DEFAULT_COUNTRY;
  els.zip.value = params.get('zip') ?? storage.get('zip') ?? '';
  updateLocationField(params.get('city') ?? storage.get('city') ?? '');
  if (matchMedia('(max-width: 900px)').matches) els.filtersPanel.open = false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });
  els.country.addEventListener('change', () => {
    updateLocationField();
    renderMode();
  });
  els.filtersPanel.addEventListener('change', (event) => {
    if (!event.target.id.startsWith('source-')) readFilters();
  });
  els.maxTotal.addEventListener('input', readFilters);
  els.reset.addEventListener('click', resetFilters);

  const q = params.get('q')?.trim();
  if (q) {
    els.q.value = q;
    search();
  } else {
    showExample();
  }
}

init();
