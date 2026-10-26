# Hisham's Tool

Find the cheapest deal on any product, **with shipping included**.

A low sticker price often hides an expensive shipping fee. Hisham's Tool searches several
stores at once, adds each offer's shipping cost to your city or postal code, and ranks
everything by what you actually pay.

## Features

- **Saudi Arabia first**: searches **noon** and **Haraj** out of the box, no keys needed.
  Prices in SAR, and you pick your city instead of typing a postal code.
- **Ranks by delivered price**: item price + shipping, cheapest first.
- **Local pickup counts**: a Haraj listing in your own city is ranked as free pickup.
- **Shows the math** for the best deal (item + shipping = you pay), with a bar per offer
  showing how much of the total is shipping.
- **Flags the sticker-price trap**: when the lowest listed price costs more once shipping is
  added, it tells you by how much.
- **Filters**: condition (new, used, refurbished), free shipping or pickup only, max total,
  sources, and a clean-up filter that hides accessories (English and Arabic), items sold for
  parts and suspiciously cheap listings.
- **Honest about unknowns**: offers that don't list shipping are marked and ranked after
  the ones whose total is known.
- **Arabic and English** searches both work; Arabic titles display right to left.
- **Amazon and AliExpress** in every country, including amazon.sa (API keys needed).
- **Other countries**: US, Canada, UK, Australia, Germany, France, Italy and Spain through
  Amazon, AliExpress, eBay and Google Shopping (API keys needed).
- **No dependencies**: plain Node.js and browser JavaScript. Nothing to install.

## Price sources

| Source | Countries | What it covers | Shipping | Key |
| --- | --- | --- | --- | --- |
| **noon** | Saudi Arabia | New items from noon.com (Saudi store) | Not in search results: shown as unknown, check noon's checkout | None |
| **Haraj** | Saudi Arabia | Classifieds on haraj.com.sa, mostly used items | Free pickup in your city; other cities: arrange with the seller | None |
| **Amazon** (via [SerpAPI](https://serpapi.com/amazon-search-api)) | All (amazon.sa, amazon.com, amazon.co.uk, …) | Amazon search results in your country's Amazon store | Read from the delivery text ("FREE delivery …") | SerpAPI key |
| **AliExpress** ([Affiliate API](https://openservice.aliexpress.com)) | All | Items that ship to your country (Saudi prices converted from USD at 3.75) | Not returned by the API: shown as unknown | AliExpress app key and secret |
| [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html) | US, CA, UK, AU, DE, FR, IT, ES | Fixed-price eBay listings that ship to you | Exact cost to your postal code | Free developer account |
| [Google Shopping via SerpAPI](https://serpapi.com/google-shopping-api) | All | Many stores (Amazon, Walmart, Best Buy, and local Saudi stores that list on Google) | Read from the listing's delivery text | Free tier: 100 searches/month |

A country with no live source shows **sample data** from fictional stores, clearly labeled,
so you can try everything first.

### About noon and Haraj

Neither site offers a public API, so Hisham's Tool calls the same search endpoints their own
websites use. That means:

- **noon blocks most cloud servers.** If you host Hisham's Tool on a cloud service, noon will
  usually refuse the search and the page will say so (Haraj and other sources still work).
  Run it on your own computer, on a home or office internet connection in Saudi Arabia, for
  noon results. If noon never works where you host it, set `DISABLE_SOURCES=noon`.
- **noon's delivery fee isn't in its search results.** It depends on your order total, noon
  Express and noon One membership, so noon offers show "Delivery fee shown at noon checkout"
  and rank after offers with a known total.
- **Haraj listings without a price are skipped**, because their sellers want offers.
- Either site can change its endpoints without notice, which would break that source until
  the code is updated. Their terms of use may also restrict automated access; this tool
  makes one request per search and caches results for 5 minutes.

## Run it

Requires Node.js 20.12 or newer.

```bash
cp .env.example .env   # optional: add eBay or SerpAPI keys
npm start              # http://localhost:3000
```

`npm run dev` restarts the server when files change. `npm test` runs the test suite.

### Getting keys (optional)

**SerpAPI** (turns on **Amazon** and **Google Shopping**)
1. Sign up at [serpapi.com](https://serpapi.com/). The free plan has 250 searches a month;
   each Hisham's Tool search uses 2 (one for Amazon, one for Google Shopping), and repeat
   searches within 5 minutes are free. To save searches, turn one off with
   `DISABLE_SOURCES=google`. In Saudi Arabia, Google Shopping is also how noon's prices
   come in (noon.com is one of the stores it lists).
2. Copy your key from [Manage API Key](https://serpapi.com/manage-api-key) into `SERPAPI_KEY`.

**AliExpress**
1. Join the AliExpress affiliate program at [portals.aliexpress.com](https://portals.aliexpress.com/).
2. At [openservice.aliexpress.com](https://openservice.aliexpress.com), register as a
   developer and create an app for the **Affiliates API**. AliExpress reviews new apps,
   which usually takes 1 to 2 business days.
3. Put the App Key in `ALIEXPRESS_APP_KEY` and the App Secret in `ALIEXPRESS_APP_SECRET`.
   Optionally put your affiliate tracking ID in `ALIEXPRESS_TRACKING_ID`.

**eBay** (not available in Saudi Arabia)
1. Sign up at [developer.ebay.com](https://developer.ebay.com/) and open
   [Application Keys](https://developer.ebay.com/my/keys).
2. Create a **Production** keyset (you may be asked to opt out of marketplace account
   deletion notifications or set up an endpoint first).
3. Put the App ID in `EBAY_CLIENT_ID` and the Cert ID in `EBAY_CLIENT_SECRET`.

Restart the server after changing `.env`. The badge in the top-right corner of the page
shows which sources are live for the selected country.

## Live website (GitHub Pages)

The workflow in `.github/workflows/pages.yml` runs the tests on every push and publishes the
site from the default branch to **https://hisham93h.github.io/HISHAM_TAMER_SHAAT/**.

Turn it on once:
1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Website → Run workflow** (or push any change).

On GitHub Pages the site has no server. It searches **Haraj live, straight from your
browser** (Haraj allows this). Amazon, AliExpress, noon, eBay and Google Shopping need the
server, so they aren't searched there, and countries other than Saudi Arabia show sample data.

## Full website with Amazon and AliExpress (Vercel)

Amazon, AliExpress, eBay and Google Shopping need a server to keep your API keys secret.
[Vercel](https://vercel.com) runs it for free, using the `api/` folder and `vercel.json`:

1. Sign in at [vercel.com/new](https://vercel.com/new) with your GitHub account.
2. Import the **HISHAM_TAMER_SHAAT** repository. Leave the build settings as they are.
3. Open **Environment Variables** and add your keys (`SERPAPI_KEY`, `ALIEXPRESS_APP_KEY`,
   `ALIEXPRESS_APP_SECRET`, and optionally `ALIEXPRESS_TRACKING_ID`).
4. Click **Deploy**. Your site gets an address like `hisham-tamer-shaat.vercel.app`, and every
   push updates it.

Haraj works there too. noon is turned off on Vercel, because noon blocks Vercel's servers.

## Hosting the server elsewhere

Any host that runs Node also works (Render, Railway, Fly.io, a VPS): use `npm start` as the
start command and set any keys as environment variables. The server listens on `PORT`
(default 3000). For noon results, run it on your own computer in Saudi Arabia.

## How the ranking works

1. Every source that covers your country is searched at the same time. If one fails, the
   others still show results and the page says which source failed and why.
2. Each offer gets `total = price + shipping`:
   - eBay: the cheapest shipping option to your postal code.
   - Google Shopping: parsed from the delivery text. "Free delivery on orders over $35"
     counts as free only when the item costs at least $35.
   - Haraj: 0 when the seller is in your city (pickup), otherwise unknown.
   - noon: unknown.
3. Offers are sorted by total. Offers with unknown shipping come after the priced ones.
   If no offer has a known total, the top card shows the lowest price and says shipping
   isn't included.
4. Offers in a different currency from your country's are left out, so totals are comparable.
5. Results are cached for 5 minutes.

Sales tax and import duties are not added (noon's Saudi prices already include VAT).

## API

`GET /api/search?q=<product>&country=SA&city=<city id>`
`GET /api/search?q=<product>&country=<US|CA|GB|AU|DE|FR|IT|ES>&zip=<postal code>`

`country` defaults to `SA`. Saudi city ids: `riyadh`, `jeddah`, `makkah`, `madinah`,
`eastern` (Dammam/Khobar), `taif`, `qassim`, `abha`, `tabuk`, `hail`, `jazan`, `najran`,
`jouf`, `hafr`, `arar`, `yanbu`.

```json
{
  "query": "iphone 15 pro",
  "zip": "",
  "city": "riyadh",
  "country": "SA",
  "currency": "SAR",
  "demo": false,
  "sources": [
    { "id": "noon", "name": "noon", "ok": false, "count": 0, "error": "noon refused the request (HTTP 503). …" },
    { "id": "haraj", "name": "Haraj", "ok": true, "count": 47 }
  ],
  "offers": [
    {
      "id": "haraj:191332421",
      "title": "ايفون 15 Pro",
      "url": "https://haraj.com.sa/11191332421/...",
      "image": "https://mimg6cdn.haraj.com.sa/...",
      "source": "haraj",
      "sourceName": "Haraj",
      "seller": "t_gh25",
      "price": 1500,
      "shipping": 0,
      "pickup": true,
      "total": 1500,
      "currency": "SAR",
      "condition": "used",
      "delivery": "Pickup in Riyadh"
    }
  ],
  "fetchedAt": "2026-10-26T12:00:00.000Z"
}
```

`GET /api/status` lists the sources, whether each is turned on, and the countries each covers.

## Project layout

```
server.js                 Starts the server and loads .env
src/app.js                HTTP server: API routes and static files
src/search.js             Searches all sources, merges, ranks and caches
src/providers/            Server-only price sources (noon, Amazon, AliExpress, eBay, Google Shopping)
api/                      Vercel functions for /api/search and /api/status (see vercel.json)
public/index.html         The website
public/app.js             Browser code: search, filters, rendering
public/styles.css         Styles (light and dark themes)
public/lib/               Shared by the server and the browser:
  places.js                 countries and Saudi cities
  money.js                  price and shipping-text parsing
  deals.js                  totals, ranking, filters, best-deal summary
  sources.js                searches several sources and merges the results
  haraj.js                  Haraj search (runs on the server or in the browser)
  demo.js                   sample offers for countries without a live source
test/                     node:test suites
.github/workflows/        Tests every push; publishes public/ to GitHub Pages
```

### Adding a source

Create a file in `src/providers/` (or `public/lib/` if the site can call the source straight
from the browser) that exports an object with `id`, `name`, `countries`
(country codes it covers), `isConfigured(env)` and
`async search({ q, zip, city, country }, { env, fetch })`, returning offers in the shape shown
above (without `total`; it is calculated for you). Then add it to the `providers` list in
`src/search.js`.
