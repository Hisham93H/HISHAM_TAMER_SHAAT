# Hisham's Tool

Find the cheapest deal on any product, **with shipping included**.

A low sticker price often hides an expensive shipping fee. Hisham's Tool searches several
stores at once, adds each offer's shipping cost to your postal code, and ranks everything
by what you actually pay.

## Features

- **Ranks by delivered price**: item price + shipping, cheapest first.
- **Shows the math** for the best deal (item + shipping = you pay), with a bar per offer
  showing how much of the total is shipping.
- **Flags the sticker-price trap**: when the lowest listed price costs more once shipping is
  added, it tells you by how much.
- **Shipping to your address**: enter a ZIP or postal code and country (US, CA, UK, AU, DE,
  FR, IT, ES).
- **Filters**: condition (new, used, refurbished), free shipping only, max total, sources,
  and a clean-up filter that hides accessories, items sold for parts and suspiciously cheap
  listings.
- **Honest about unknowns**: offers that don't list shipping are marked and ranked after
  the ones whose total is known.
- **No dependencies**: plain Node.js and browser JavaScript. Nothing to install.

## Price sources

| Source | What it covers | Shipping data | Key |
| --- | --- | --- | --- |
| [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html) | Fixed-price eBay listings that ship to your country | Exact cost to your postal code, calculated by eBay | Free developer account |
| [Google Shopping via SerpAPI](https://serpapi.com/google-shopping-api) | Amazon, Walmart, Best Buy, Target and many other stores | Read from the listing's delivery text ("Free delivery", "$5.99 delivery") | Free tier: 100 searches/month |

With no keys set, the tool runs in **demo mode**: searches return sample offers from
fictional stores, clearly labeled, so you can try everything before signing up for anything.

## Run it

Requires Node.js 20.12 or newer.

```bash
cp .env.example .env   # then add your keys (optional)
npm start              # http://localhost:3000
```

`npm run dev` restarts the server when files change. `npm test` runs the test suite.

### Getting the keys

**eBay**
1. Sign up at [developer.ebay.com](https://developer.ebay.com/) and open
   [Application Keys](https://developer.ebay.com/my/keys).
2. Create a **Production** keyset (you may be asked to opt out of marketplace account
   deletion notifications or set up an endpoint first).
3. Put the App ID in `EBAY_CLIENT_ID` and the Cert ID in `EBAY_CLIENT_SECRET`.

**Google Shopping (SerpAPI)**
1. Sign up at [serpapi.com](https://serpapi.com/).
2. Copy your key from [Manage API Key](https://serpapi.com/manage-api-key) into `SERPAPI_KEY`.

Restart the server after changing `.env`. The badge in the top-right corner of the page
shows which sources are live.

## Deploy

Any host that runs Node works (Render, Railway, Fly.io, a VPS). Use `npm start` as the start
command and set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` and/or `SERPAPI_KEY` as environment
variables. The server listens on `PORT` (default 3000).

The `public/` folder also works on its own on any static host (such as GitHub Pages). Without
the server it runs in demo mode.

## How the ranking works

1. Every configured source is searched at the same time. If one fails, the others still show
   results and the page says which source failed.
2. Each offer gets `total = price + shipping`. For eBay, shipping is the cheapest shipping
   option to your postal code. For Google Shopping, it is parsed from the delivery text;
   "Free delivery on orders over $35" counts as free only when the item costs at least $35.
3. Offers are sorted by total. Offers with unknown shipping come after the priced ones.
4. Offers in a different currency from your country's are left out, so totals are comparable.
5. Results are cached for 5 minutes to save API quota.

Sales tax and import duties are not included.

## API

`GET /api/search?q=<product>&zip=<postal code>&country=<US|CA|GB|AU|DE|FR|IT|ES>`

```json
{
  "query": "nintendo switch oled",
  "zip": "10001",
  "country": "US",
  "currency": "USD",
  "demo": false,
  "sources": [{ "id": "ebay", "name": "eBay", "ok": true, "count": 87 }],
  "offers": [
    {
      "id": "ebay:v1|1234|0",
      "title": "Nintendo Switch OLED Console",
      "url": "https://www.ebay.com/itm/1234",
      "image": "https://i.ebayimg.com/...",
      "source": "ebay",
      "sourceName": "eBay",
      "seller": "gamehub",
      "price": 289.99,
      "shipping": 7.5,
      "total": 297.49,
      "currency": "USD",
      "condition": "new",
      "delivery": "Arrives Oct 30 – Nov 2"
    }
  ],
  "fetchedAt": "2026-10-26T12:00:00.000Z"
}
```

`GET /api/status` lists the sources and whether each one is configured.

## Project layout

```
server.js                 Starts the server and loads .env
src/app.js                HTTP server: API routes and static files
src/search.js             Searches all sources, merges, ranks and caches
src/providers/            One file per price source (eBay, Google Shopping)
public/index.html         The website
public/app.js             Browser code: search, filters, rendering
public/styles.css         Styles (light and dark themes)
public/lib/               Shared by the server and the browser:
  money.js                  price and shipping-text parsing
  deals.js                  totals, ranking, filters, best-deal summary
  demo.js                   sample offers for demo mode
test/                     node:test suites
```

### Adding a source

Create a file in `src/providers/` that exports an object with `id`, `name`,
`isConfigured(env)` and `async search({ q, zip, country }, { env, fetch })`, returning offers
in the shape shown above (without `total`; it is calculated for you). Then add it to the
`providers` list in `src/search.js`.
