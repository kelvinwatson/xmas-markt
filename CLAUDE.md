# XmasMarkt — project brief

Handoff notes from planning done in Claude chat, before moving to Claude
Code for the git/scraper/CI work. Read this first so you're not starting
from zero.

## What this is

A PWA for finding Christmas markets in Berlin — map + list of markets,
vendor details per market, and favourites. **Name: XmasMarkt** — see
naming notes below. Domain: **xmas-markt.de** (matches the GitHub repo
name `xmas-markt`; not yet registered).

## Why it exists

Personal project, not (yet) monetized. Originally planned as a Kotlin
Multiplatform app, but pivoted to a static web/PWA to avoid Apple/Google
developer account fees. Briefly considered Google Antigravity as the
build tool instead of Claude, but decided to stick with Claude.

## Feature scope (v1)

- Map view + list view, toggled from the header
- Vendor details per market (food/gifts/hours), lazily loaded — only
  fetched when a market is actually opened, not all up front
- **Favourites: local-only for v1.** Stored in `localStorage`, no
  account needed, works immediately. Deliberately chosen over
  account-gated favourites so the app stays fully browsable with zero
  friction.
- **Reliability indicator: v1 ships the `source` signal, `crowdsource`
  is schema'd in from day one but stays empty until comments land.**
  `confidence` is an object, not a flat value:
  ```
  confidence: {
    source: "verified" | "check-ahead",  // v1: computed at scrape time
                                          // from source.tier + lastChecked
                                          // freshness, no backend needed
    crowdsource: null                    // post-v1: becomes
                                          // { confirmedCount, deniedCount,
                                          //   lastConfirmedAt } once user
                                          // verification exists
  }
  ```
  Structuring it as an object now (instead of a single flat badge
  value) means the UI can start on `confidence.source` alone and later
  combine both signals — e.g. prefer a recent crowdsource confirmation
  over the automated one — without a schema migration when comments
  ship. Exists specifically because scraped data can go stale or a
  market can be cancelled (weather, etc.) between scraper runs, and the
  app should say so honestly rather than imply certainty it doesn't
  have.
- **Comments / crowdsourced verification: deferred**, not in v1, but
  do not drop this — it's the planned upgrade path for the reliability
  indicator above (e.g. "3 people confirmed this was open yesterday"
  alongside or instead of the automated badge). Will reuse whatever
  backend gets added for synced favourites (see below), since both
  need the same piece.
- **Favourites sync across devices: planned, not built.** When added,
  it's meant to be *additive* — sign-in optional, browsing and local
  favourites still work with zero account. Plan was Firebase Auth
  (Google sign-in) + Firestore, chosen because the free tier is
  generous enough that cost is a non-issue at this scale, and it fits
  well with the offline-first PWA approach.

## Architecture as built

- Fully static frontend: plain HTML/CSS/JS, no framework, Leaflet +
  OpenStreetMap tiles for the map.
- Data is split into a small `markets-index.json` (loads immediately —
  just enough for map pins + list cards) and per-market
  `vendors/{id}.json` files (fetched on demand). This was a deliberate
  choice so browsing stays fast regardless of how much vendor detail
  gets added later.
- **Market record schema** (revised before real data population — the
  original 4 sample markets only had `id, name, district, lat, lng,
  dates, hours, tags, summary, vendorFile, lastChecked`):
  ```
  {
    id, name, district, address, lat, lng,
    dates: { start, end },
    hours: { monThu, friSat, sun },
    tags, summary,
    images: [],                          // photo URLs — empty until a real
                                          // scraper/source exists; renders as
                                          // a swipeable carousel in the sheet,
                                          // first image as the list-card thumb
    vendorFile, lastChecked,

    source: {
      officialUrl,                       // visitberlin.de / Bezirk page
      organizerUrl,                      // market's own site, if any
      tier: "official" | "organizer" | "aggregator"
    },
    status: "confirmed" | "tentative" | "unavailable",
    entry: "free" | "ticketed",
    confidence: {                        // see reliability indicator,
      source: "verified" | "check-ahead", // above, for the full rationale
      crowdsource: null
    }
  }
  ```
  `source`, `status`, and `entry` exist because real scraped data needs
  provenance (traceable back to which page it came from) and honesty
  about dates that aren't finalized yet — the 4 hand-typed sample
  markets didn't need any of this since they were fictional.
- `data/overrides.json` — manual corrections that take precedence over
  scraped data, specifically so a same-day closure or scraper breakage
  can be patched instantly without waiting on a source or redeploying.
- Every market/vendor record carries a `lastChecked` timestamp, shown
  in the UI — the design intent is to show data freshness honestly
  rather than imply real-time accuracy the scraper can't actually
  promise (weather closures especially — sources rarely reflect those
  fast, so the app doesn't try to promise same-day closure detection).
- Scraper (`scraper/scrape.js`) is a **skeleton only** — real source
  selection hasn't happened yet. Priority order agreed: official
  tourism/Bezirk pages first (most authoritative for hours/dates), the
  market's own site/socials second (fastest for closures), aggregator
  sites last and only for descriptions, never for anything
  time-sensitive.
- GitHub Actions workflow already wired to run the scraper twice daily
  and commit the result — no changes needed there unless the schedule
  should shift once real scraping exists.
- Currently all market/vendor data is placeholder (`isSampleData: true`
  in every file) — generic vendor names, not scraped from anywhere.
  Don't treat it as real.

## Design system

Deliberately avoided generic AI-app defaults (cream+terracotta, SaaS
rounded-shadow cards, ALL-CAPS eyebrow labels). Chose instead:

- **Palette:** deep pine green + warm gold accent (lantern-glow
  metaphor — the string-light glow against a dark winter evening is
  the single most recognizable image of these markets, and the
  intended visual anchor for the whole app) + warm paper background +
  plum for closed/secondary states.
- **Type:** Fraunces (display, used sparingly — one hero moment) +
  Inter (UI/body).
- **Cards:** hairline top border + left accent bar, not rounded
  shadow cards — a deliberate departure from the generic SaaS-card
  look.
- Note: naming went through several rounds. "Lichtermarkt" was rejected
  first — it's already the specific name of two real Berlin markets
  (Lichtenrader Lichtermarkt, Lichtenberger Lichtermarkt), so it would
  confuse rather than brand. "Marktlicht" ("market light") was the
  working name after that, tied to the lantern-glow palette — but was
  ultimately felt to be too abstract; it names a mood, not what the app
  does. Considered "ChristmasMarkt" next — concrete, unmistakably
  Christmas, no umlauts — with "XmasMarkt" as a short name/icon label
  alongside it, split specifically to balance findability (full
  "Christmas" matches more search queries) against brevity. Landed on
  **XmasMarkt** alone in the end, dropping the split: the GitHub repo
  was already created as `xmas-markt`, and the much cheaper `.de`
  pricing sealed it (see cost plan below) — matching name, repo, and
  domain was simpler than maintaining two names for a marginal
  findability gain. `weihnachtsmarkt.de` was ruled out as a domain —
  it's an established, actively monetized German Christmas content
  site, not available and not a name worth competing with anyway (too
  generic/category-level). `christmasmarkt.de` is registered but
  parked/unused. `christmasmarkt.berlin` was checked and confirmed
  available via the official `.berlin` RDAP registry, but priced at
  **€64.80/year** — a `.berlin` geo-TLD premium — versus **€6/year**
  for `xmas-markt.de`, which settled it in favour of the `.de` domain.

## Hosting / cost plan

Static host (GitHub Pages was the working assumption) for the frontend
+ data files — free. Firebase Spark (free tier) for Auth + Firestore
once sync is added — free at this scale. Only real cost is the domain:
`xmas-markt.de` at **€6/year** (chosen over `christmasmarkt.berlin`
at €64.80/year — see naming notes above). Map tiles via OSM are free but not meant
for heavy production traffic — worth revisiting (MapTiler/Stadia Maps)
if the app ever gets real traffic.

## Monetization — status: not cleared yet

Plan is to potentially monetize later. **Don't enable any
monetization yet** — there's an outstanding personal/legal check that
needs to close out first. Details intentionally kept out of this
file — personal/legal specifics don't belong in a checked-in file
regardless of repo visibility; ask if you need the context.

## Open items / not yet built

- Pick real scraper sources per market, fill in `scraper/scrape.js`
- Real app icons (placeholders currently in `icons/`)
- Register `xmas-markt.de` (not yet purchased)
- Firebase Auth + Firestore integration for synced favourites
- Comments (post-v1)
- Approval check before turning on any monetization
