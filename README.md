# XmasMarkt

A static PWA for finding Christmas markets in Berlin: map + list of
markets, vendor details, and favourites that work without an account
(local-only for now, Firebase sync planned for later).

## ⚠️ Sample data

`data/markets-index.json` and `data/vendors/*.json` currently contain
**placeholder data** — real-looking coordinates and dates, but generic
vendor names (not scraped from anywhere yet). Every file has
`"isSampleData": true` so this is easy to check for programmatically once
the real scraper is wired up. Don't publish this data as if it's accurate.

## Running it locally

Browsers block `fetch()` of local files over `file://`, so you need a tiny
local server — pick whichever you have:

```bash
# Option A: Python (usually already installed)
cd xmas-markt
python3 -m http.server 8080

# Option B: Node
npx serve .
```

Then open `http://localhost:8080`.

## Project structure

```
index.html            App shell
css/styles.css         Design system + all styles
js/app.js               Map, list, favourites, detail sheet logic
manifest.json           PWA manifest
sw.js                    Service worker (offline + installable)
icons/                   Placeholder app icons — replace before shipping
data/
  markets-index.json     Small file — map pins + list cards read this
  overrides.json         Manual corrections; takes precedence over scraper output
  vendors/{id}.json       Per-market vendor detail — fetched only when a market is opened
scraper/
  scrape.js               Skeleton — TODOs for real source scraping
.github/workflows/
  scrape.yml              Runs the scraper twice daily, commits updated data
```

### Why the data is split into an index + per-market files

The index file (`markets-index.json`) is small and loads immediately —
just enough to draw pins and list cards. Vendor detail
(`vendors/{id}.json`) only downloads when someone actually opens that
market, so browsing the map/list stays fast even as more markets and
vendors get added.

## Favourites (current: local-only)

Favourites are stored in `localStorage`, per browser/device — no account
needed, and the app is fully usable without ever signing in. This is
intentional for v1. A future pass can add optional sign-in (Firebase Auth)
so favourites sync across devices for anyone who wants that — see project
notes for the planned approach.

## Deploying

Any static host works since there's no backend:

- **GitHub Pages** — push this folder to a repo, enable Pages on the
  `main` branch (or a `docs/` folder / `gh-pages` branch).
- **Netlify / Vercel / Cloudflare Pages** — connect the repo, no build
  step needed (this is plain HTML/CSS/JS).

Remember to swap the placeholder icons in `icons/` for real ones before
calling it done — sized 192×192 and 512×512, referenced from
`manifest.json`.

## Wiring up the real scraper

`scraper/scrape.js` is a skeleton, not a working scraper yet — it doesn't
know which sites to hit. Next steps:

1. Pick sources per market (official tourism/Bezirk page first, market's
   own site/socials second, aggregator sites only for descriptions).
2. Fill in `scrapeMarket()` / `scrapeVendorsForMarket()` with real
   fetch + `cheerio` parsing per source.
3. Test locally with `npm run scrape` inside `scraper/`.
4. The GitHub Actions workflow (`.github/workflows/scrape.yml`) already
   runs it twice a day and commits the result — no changes needed there
   unless the schedule should shift.

The scraper already supports:
- **Manual overrides** (`data/overrides.json`) — hand-edit this to patch
  something instantly (e.g. a weather closure) without waiting on a
  source to update or redeploying anything.
- **Change logging** — each run diffs against the previous index and
  logs what changed, so a scraper break (something silently disappearing)
  is easier to spot than a real closure.

## Not yet built

- Comments (deferred past v1 — will reuse Firebase once favourites sync
  is added, since both need the same backend piece)
- Firebase Auth + Firestore sync for favourites across devices
- Real scraper logic (see above)
- Real app icons
