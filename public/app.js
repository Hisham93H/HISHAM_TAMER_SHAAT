import { COUNTRIES } from './lib/money.js';
import { filterOffers, sortOffers, summarize } from './lib/deals.js';
import { demoResult } from './lib/demo.js';

const EXAMPLE_QUERY = 'wireless earbuds';
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

async function search() {
  const q = els.q.value.trim().replace(/\s+/g, ' ');
  if (!q) {
    els.q.focus();
    return;
  }
  const country = els.country.value;
  const zip = els.zip.value.trim();
  storage.set('country', country);
  storage.set('zip', zip);
  try {
    history.replaceState(null, '', `?${new URLSearchParams({ q, zip, country })}`);
  } catch { /* the address can't change here */ }

  const id = ++state.requestId;
  Object.assign(state, { loading: true, error: null, example: false });
  render();
  try {
    await backendReady;
    const result = state.backend ? await fetchResult({ q, zip, country }) : demoResult(q, country, zip);
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
  state.example = true;
  state.result = demoResult(EXAMPLE_QUERY, els.country.value, els.zip.value.trim());
  render();
}

// Rendering

function renderMode() {
  const backend = state.backend;
  const live = backend ? backend.sources.filter((s) => s.configured).map((s) => s.name) : [];
  els.mode.textContent = live.length ? `Live · ${live.join(' + ')}` : 'Demo data';
  els.mode.classList.toggle('is-live', live.length > 0);
  render();
}

function renderNotices() {
  const notes = [];
  const result = state.result;
  if (state.example) {
    notes.push(h('p', { class: 'notice' },
      h('strong', null, 'Example search. '),
      `These results for “${EXAMPLE_QUERY}” are sample offers from fictional stores. Search for any product above.`));
  } else if (result?.demo && !state.loading) {
    notes.push(h('p', { class: 'notice is-warning' },
      h('strong', null, 'Demo mode. '),
      state.backend
        ? 'No price sources are set up on the server yet, so these offers come from fictional stores. Add eBay or SerpAPI keys to the .env file to compare live prices.'
        : 'These offers come from fictional stores so you can try the tool. Run the Hisham’s Tool server with eBay or SerpAPI keys to compare live prices.'));
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
  return url
    ? h('a', { class: className, href: url, target: '_blank', rel: 'noopener noreferrer' }, offer.title)
    : h('span', { class: className }, offer.title);
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
  return offer.shipping === 0 ? 'Free' : `+${money(offer.shipping, offer.currency)}`;
}

function meta(offer) {
  const rating = offer.rating != null
    ? `★ ${offer.rating}${offer.reviews ? ` (${offer.reviews.toLocaleString()})` : ''}`
    : offer.sellerFeedback;
  return h('div', { class: 'meta' },
    h('span', { class: 'seller' }, offer.seller),
    offer.source !== 'demo' && h('span', null, offer.sourceName),
    CONDITION_LABELS[offer.condition] && h('span', { class: 'chip' }, CONDITION_LABELS[offer.condition]),
    offer.shipping === 0 && h('span', { class: 'chip is-free' }, 'Free shipping'),
    offer.shipping == null && h('span', { class: 'chip is-unknown' }, 'Shipping unknown'),
    rating && h('span', null, rating),
    offer.delivery && h('span', null, offer.delivery));
}

function renderBest(summary) {
  const best = summary?.best;
  els.best.hidden = !best;
  if (!best) return els.best.replaceChildren();
  const savings = summary.savingsVsTypical > 0
    ? h('p', { class: 'best-savings' },
      h('strong', null, `${money(summary.savingsVsTypical)} less`),
      ` than the typical delivered price of ${money(summary.typicalTotal)} across ${count(summary.count, 'offer')}.`)
    : null;
  els.best.replaceChildren(h('article', { class: 'best', 'aria-label': 'Cheapest delivered offer' },
    h('div', { class: 'best-main' },
      h('div', { class: 'eyebrow' }, 'Cheapest delivered'),
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
        h('div', { class: 'is-total' }, h('dt', null, 'You pay'), h('dd', null, money(best.total, best.currency)))),
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
  const names = state.backend ? state.backend.sources.filter((s) => s.configured).map((s) => s.name) : [];
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
  const country = COUNTRIES[result.country]?.name ?? result.country;
  els.status.replaceChildren(
    h('strong', null, count(visible.length, 'offer')),
    ` for “${result.query}”, shipping to ${result.zip ? `${result.zip}, ${country}` : country}.`);
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

function updatePostalPlaceholder() {
  els.zip.placeholder = COUNTRIES[els.country.value]?.postal ?? 'Postal code';
}

function init() {
  for (const [code, country] of Object.entries(COUNTRIES)) {
    els.country.append(h('option', { value: code }, country.name));
  }
  const params = new URLSearchParams(location.search);
  const country = [params.get('country'), storage.get('country')]
    .map((c) => c?.toUpperCase())
    .find((c) => c && Object.hasOwn(COUNTRIES, c));
  els.country.value = country ?? 'US';
  els.zip.value = params.get('zip') ?? storage.get('zip') ?? '';
  updatePostalPlaceholder();
  if (matchMedia('(max-width: 900px)').matches) els.filtersPanel.open = false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });
  els.country.addEventListener('change', updatePostalPlaceholder);
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
