// Real scraper, sourced from visitberlin.de — the official Berlin tourism
// site, first in our priority order (official/Bezirk pages > organizer
// site/socials > aggregators, and never aggregators for anything
// time-sensitive; see CLAUDE.md).
//
// Every market comes from visitBerlin's own district-filtered listings
// (discoverMarketCards below) and carries ONLY real scraped fields: name and
// summary verbatim from visitBerlin's listing teaser, no invented tags, and
// no vendor data (none is published in a scrapable form, and we never
// fabricate placeholder content for a market we haven't actually scraped).
//
// The one hand-kept list, STABLE_IDS, only pins a few markets to friendlier
// ids (so shared links and saved favourites keep working) and records their
// organizer sites. It contains no editorial content.

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const DATA_DIR = path.join(__dirname, "..", "data");
const VENDORS_DIR = path.join(DATA_DIR, "vendors");

// The season this scrape run is for — used to flag a source page that
// hasn't been updated yet (e.g. still shows last year's dates) as
// "tentative" rather than silently treating stale data as confirmed.
const SEASON_YEAR = 2026;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const BASE_URL = "https://www.visitberlin.de";

// visitBerlin's own district categorization for its Christmas markets
// listing — crawling all 12 gets us every market's real district for free,
// without guessing from zip codes. Slugs are copied verbatim (already
// percent-encoded) from the listing page's own district <select> options.
const DISTRICTS = [
  { slug: "steglitz-zehlendorf", name: "Steglitz-Zehlendorf" },
  { slug: "neuk%C3%B6lln", name: "Neukölln" },
  { slug: "charlottenburg-wilmersdorf", name: "Charlottenburg-Wilmersdorf" },
  { slug: "mitte", name: "Mitte" },
  { slug: "friedrichshain-kreuzberg", name: "Friedrichshain-Kreuzberg" },
  { slug: "tempelhof-sch%C3%B6neberg", name: "Tempelhof-Schöneberg" },
  { slug: "spandau", name: "Spandau" },
  { slug: "pankow", name: "Pankow" },
  { slug: "treptow-k%C3%B6penick", name: "Treptow-Köpenick" },
  { slug: "lichtenberg", name: "Lichtenberg" },
  { slug: "reinickendorf", name: "Reinickendorf" },
  { slug: "marzahn-hellersdorf", name: "Marzahn-Hellersdorf" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function idFromHref(href) {
  return href
    .replace(/^\/en\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// visitBerlin's listing teaser text (in either language) leads with a date
// phrase followed by a colon — "23 November to 22 December 2026: ..." in
// English, "23. November bis 31. Dezember 2026: ..." in German. Rather than
// maintain a parsing ladder per language (dates already have their own
// field via parseDateRange, which only ever reads the English page), just
// strip everything up to the first colon when the text starts with a day
// number — works uniformly across both languages' phrasings.
function stripLeadingDatePhrase(rawText) {
  const m = rawText.match(/^\d{1,2}(?:st|nd|rd|th|\.)?\s.*?:\s*/i);
  return (m ? rawText.slice(m[0].length) : rawText).trim();
}

// visitBerlin publishes the same district-filtered listing in both
// languages, with an identical card structure and the same district slugs
// — only the base path and the "Read more" link text differ.
const LISTING_PATHS = {
  en: { base: "christmas-markets-berlin/district", readMore: "Read more" },
  de: { base: "weihnachtsmaerkte-berlin/bezirk", readMore: "Weiterlesen" },
};

// Crawls visitBerlin's district-filtered Christmas market listings (in the
// given language) and returns every real market card found: { href, name,
// teaser, district }. Paid placements (marked "Advertisement") and links
// off visitBerlin.de are skipped — the app's provenance model is built
// around visitBerlin as an official-tier source, not third-party
// advertiser pages.
async function discoverMarketCards(lang) {
  const { base, readMore } = LISTING_PATHS[lang];
  const cards = new Map();
  for (const district of DISTRICTS) {
    let page = 0;
    while (true) {
      const url = `${BASE_URL}/${lang}/${base}/${district.slug}?page=${page}`;
      let html;
      try {
        html = await fetchHtml(url);
      } catch (err) {
        console.warn(`District listing failed: ${district.name} (${lang}) page ${page}: ${err.message}`);
        break;
      }
      const $ = cheerio.load(html);
      const pageCards = $(".teaser-search--poi");
      if (pageCards.length === 0) break;

      pageCards.each((_, el) => {
        const $el = $(el);
        const href = $el.find(".teaser-search__mainlink").first().attr("href");
        const isAd = /advertisement/i.test($el.find(".teaser-search__paid").first().text());
        if (!href || isAd || !href.startsWith(`/${lang}/`)) return;
        if (!cards.has(href)) {
          cards.set(href, {
            href,
            name: $el.find(".teaser-search__heading").first().text().replace(/\s+/g, " ").trim(),
            // The teaser block's own "Read more" link text gets swept up by
            // .text() since it's a sibling <p> inside the same container.
            teaser: $el
              .find(".teaser-search__text")
              .first()
              .text()
              .replace(/\s+/g, " ")
              .replace(new RegExp(`${readMore}\\s*$`), "")
              .trim(),
            district: district.name,
          });
        }
      });

      const maxPageSeen = Math.max(0, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1])));
      page += 1;
      if (page > maxPageSeen || page > 10) break; // safety cap against runaway pagination
      await sleep(200);
    }
  }
  return [...cards.values()];
}

// Pins a market to a stable, human-friendly id and records its organizer
// site. Everything else about these markets is scraped like the rest.
const STABLE_IDS = [
  {
    id: "gendarmenmarkt",
    officialUrl: "https://www.visitberlin.de/en/christmas-market-weihnachtszauber-gendarmenmarkt-berlin",
    organizerUrl: "https://www.weihnachtsmarkt-berlin.de/en/",
  },
  {
    id: "alexanderplatz",
    officialUrl: "https://www.visitberlin.de/en/christmas-market-alexanderplatz-berlin",
    organizerUrl: "https://berlinerweihnachtszeit.de/",
  },
  {
    id: "spandau",
    officialUrl: "https://www.visitberlin.de/en/spandau-christmas-market",
    organizerUrl: "https://www.altstadt-spandau.de/",
  },
  {
    id: "breitscheidplatz",
    officialUrl: "https://www.visitberlin.de/en/christmas-market-kaiser-wilhelm-memorial-church-berlin",
    organizerUrl: null,
  },
];

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function buildRange(startYear, month1, d1, endYear, month2, d2) {
  const start = `${startYear}-${pad2(month1)}-${pad2(d1)}`;
  const end = `${endYear}-${pad2(month2)}-${pad2(d2)}`;
  const yearOk = startYear === SEASON_YEAR || endYear === SEASON_YEAR;
  return { start, end, yearOk };
}

// Handles three date phrasings seen across visitBerlin market pages, tried
// most-specific first so a full two-month range is never misread as a
// same-month one:
//  - "23 November to 31 December 2026" / "23 November 2026 until 3 January 2027"
//  - "5 to 7 December 2025" (same-month short range, month named once)
//  - "13 December 2025" (single-day event)
// yearOk is false when neither year matches SEASON_YEAR (e.g. a page that
// still shows last year's dates) — a signal to mark the result "tentative"
// rather than "confirmed".
// A recurring, non-contiguous listing ("28–29 November, 5–6 December, 12–13
// December, 19–20 December") is comma-separated into more than one date-like
// segment AND spans more than one distinct month. Parsing just the first
// fragment would misleadingly imply the market closes after two days, so
// bail out honestly (unavailable / check-ahead) rather than show a partial
// range. Requiring >1 distinct month (not just >2 comma segments) avoids a
// false positive on a normal single range followed by same-month closure
// exceptions in parens, e.g. "4 December to 30 December 2025 (24, 25 and 26
// December closed, and 14 & 28 December Arcade Shop closed)".
function hasMultipleDateSegments(text) {
  const monthRegex =
    /january|february|march|april|may|june|july|august|september|october|november|december/gi;
  const months = new Set((text.match(monthRegex) || []).map((m) => m.toLowerCase()));
  const dateSegments = text.split(",").filter((seg) => /\d/.test(seg)).length;
  return months.size > 1 && dateSegments > 2;
}

const SEP = "to|until|and|&|-|–";

function parseDateRange(rawText) {
  if (hasMultipleDateSegments(rawText)) return null;
  // Strip ordinal suffixes ("30th" -> "30") so every pattern below can
  // assume a plain number precedes the month name.
  const text = rawText.replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1");

  let m = text.match(
    new RegExp(`(\\d{1,2})\\s+([A-Za-z]+)(?:\\s+(\\d{4}))?\\s+(?:${SEP})\\s+(\\d{1,2})\\s+([A-Za-z]+)(?:\\s+(\\d{4}))?`)
  );
  if (m) {
    const [, d1, mo1, y1, d2, mo2, y2] = m;
    const month1 = MONTHS[mo1.toLowerCase()];
    const month2 = MONTHS[mo2.toLowerCase()];
    if (month1 && month2) {
      const endYear = y2 ? Number(y2) : SEASON_YEAR;
      const startYear = y1 ? Number(y1) : endYear;
      return buildRange(startYear, month1, d1, endYear, month2, d2);
    }
  }

  m = text.match(new RegExp(`(\\d{1,2})\\s+(?:${SEP})\\s+(\\d{1,2})\\s+([A-Za-z]+)(?:\\s+(\\d{4}))?`));
  if (m) {
    const [, d1, d2, mo, y] = m;
    const month = MONTHS[mo.toLowerCase()];
    if (month) {
      const year = y ? Number(y) : SEASON_YEAR;
      return buildRange(year, month, d1, year, month, d2);
    }
  }

  // Day-first single day: "13 December 2025". Tried before the month-first
  // fallback below so a trailing 4-digit year never gets misread as a
  // 1-2 digit day (e.g. "13 December 2025" must not fall through to
  // matching "December" + the "20" of "2025").
  m = text.match(/(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/);
  if (m) {
    const [, d, mo, y] = m;
    const month = MONTHS[mo.toLowerCase()];
    if (month) {
      const year = y ? Number(y) : SEASON_YEAR;
      return buildRange(year, month, d, year, month, d);
    }
  }

  // Month-first, US-style single day: "December 6, 2025".
  m = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})?/);
  if (m) {
    const [, mo, d, y] = m;
    const month = MONTHS[mo.toLowerCase()];
    if (month) {
      const year = y ? Number(y) : SEASON_YEAR;
      return buildRange(year, month, d, year, month, d);
    }
  }

  return null;
}

const DAY_GROUPS = {
  monThu: ["monday", "tuesday", "wednesday", "thursday"],
  friSat: ["friday", "saturday"],
  sun: ["sunday"],
};

function timeToHHMM(raw) {
  const s = raw.trim().toLowerCase();
  if (s === "noon") return "12:00";
  if (s === "midnight") return "00:00";
  const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let [, h, min, ap] = m;
  h = Number(h);
  min = min || "00";
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${pad2(h)}:${min}`;
}

// Parses phrases like "Sunday to Thursday from 12 noon to 10 pm, Friday
// and Saturday from 12 noon to 11 pm, ..." into { monThu, friSat, sun }.
// Segments that don't start with a recognizable day name (e.g. "pyramid
// 'PartyTreff' 11 am - midnight") are ignored — those describe a single
// attraction's hours, not the market's overall hours.
function parseHours(text) {
  const result = {};
  const segments = text.split(",");
  for (const seg of segments) {
    const dayMatch = seg.match(
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:to|and)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))?/i
    );
    if (!dayMatch) continue;
    const timeMatch = seg.match(
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)/i
    );
    if (!timeMatch) continue;
    const start = timeToHHMM(timeMatch[1]);
    const end = timeToHHMM(timeMatch[2]);
    if (!start || !end) continue;
    const d1 = dayMatch[1].toLowerCase();
    const d2 = (dayMatch[2] || dayMatch[1]).toLowerCase();
    const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const i1 = order.indexOf(d1);
    const i2 = order.indexOf(d2);
    const covered = i1 <= i2 ? order.slice(i1, i2 + 1) : order.slice(i1).concat(order.slice(0, i2 + 1));
    for (const [group, days] of Object.entries(DAY_GROUPS)) {
      if (days.some((d) => covered.includes(d))) {
        result[group] = `${start}–${end}`;
      }
    }
  }
  return Object.keys(result).length === 3 ? result : null;
}

function parseEntry(text) {
  // A price mention (e.g. "2 euros") means ticketed even when the same
  // line also describes a free window/exception (under-12s, certain
  // hours) — only treat it as free when no price is stated at all.
  if (/\d+\s*(euros?|€)/i.test(text)) return "ticketed";
  return /free/i.test(text) ? "free" : "ticketed";
}

function extractCoords(html) {
  const m = html.match(/"features":\[\{"type":"point","lat":([\d.]+),"lon":([\d.]+)/);
  if (!m) return null;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

function extractChecklistWithDate($) {
  let found = null;
  $("ul.checklist--brand").each((_, el) => {
    const items = $(el)
      .find("li")
      .map((_, li) => $(li).text().replace(/ /g, " ").trim())
      .get();
    if (!found && items.some((i) => /^dates?\s*:/i.test(i))) {
      found = items;
    }
  });
  return found || [];
}

async function scrapeMarket(source, deIndex) {
  const html = await fetchHtml(source.officialUrl);
  const $ = cheerio.load(html);

  const coords = extractCoords(html);
  if (!coords) throw new Error("Could not find coordinates on page");

  // The English page links to its own German counterpart via hreflang —
  // the most reliable way to pair the two, since the URL slugs otherwise
  // differ per language (e.g. "christmas-market-x" vs "weihnachtsmarkt-x").
  // Looked up against deIndex (built from crawling the German listings)
  // rather than fetched directly, to avoid a second HTTP round-trip per
  // market. No entry means no German name/summary — left null, not
  // fabricated from a translation.
  const hreflangDe = $('link[hreflang="de"]').attr("href");
  const dePath = hreflangDe ? new URL(hreflangDe, BASE_URL).pathname : null;
  const deEntry = dePath ? deIndex.get(dePath) : null;
  const nameDe = deEntry?.name || null;
  const summaryDe = deEntry ? stripLeadingDatePhrase(deEntry.teaser) || deEntry.teaser || null : null;

  // og:image is a real, per-market hero photo (filename matches the market
  // name) rather than the generic thumbnails scattered elsewhere on the
  // page. Skip anything that isn't under visitBerlin's own image path —
  // a missing og:image sometimes falls back to a generic site logo/asset.
  const ogImage = $('meta[property="og:image"]').attr("content");
  const images = ogImage && /\/(private|files)\/image\//.test(ogImage) ? [ogImage] : [];

  const street = $(".address__street").first().text().trim();
  const zip = $(".address__zip").first().text().replace(/ /g, "").trim();
  const city = $(".address__city").first().text().trim();
  const address = street ? `${street}${zip ? ", " + zip : ""}${city ? " " + city : ""}`.trim() : null;

  const items = extractChecklistWithDate($);
  const dateLine = items.find((i) => /^dates?\s*:/i.test(i)) || "";
  const hoursLine = items.find((i) => /^opening/i.test(i)) || "";
  const admissionLine = items.find((i) => /^admission/i.test(i)) || "";

  const dateRange = parseDateRange(dateLine);
  const hours = parseHours(hoursLine);
  const entry = admissionLine ? parseEntry(admissionLine) : "free";

  let status = "confirmed";
  let confidenceSource = "verified";
  if (!dateRange) {
    status = "unavailable";
    confidenceSource = "check-ahead";
  } else if (!dateRange.yearOk) {
    status = "tentative";
    confidenceSource = "check-ahead";
  }
  if (!hours) confidenceSource = "check-ahead";

  return {
    id: source.id,
    name: source.name,
    nameDe,
    district: source.district,
    address,
    lat: coords.lat,
    lng: coords.lng,
    dates: dateRange ? { start: dateRange.start, end: dateRange.end } : { start: null, end: null },
    hours: hours || { monThu: null, friSat: null, sun: null },
    tags: source.tags || [],
    summary: source.summary || null,
    summaryDe,
    images,
    source: {
      officialUrl: source.officialUrl,
      organizerUrl: source.organizerUrl || null,
      tier: "official",
    },
    status,
    entry,
    confidence: { source: confidenceSource, crowdsource: null },
    vendorFile: source.vendorFile || null,
    lastChecked: new Date().toISOString(),
  };
}

function loadPreviousIndex() {
  const file = path.join(DATA_DIR, "markets-index.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadOverrides() {
  const file = path.join(DATA_DIR, "overrides.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

// Returns the newly-appeared market ids so main() can surface them
// prominently (this is the "did a new market pop up" signal the twice-daily
// CI run exists to catch) — everything else just goes to the console log.
function diffAndWarn(previous, next) {
  const newIds = [];
  if (!previous) return newIds;
  next.markets.forEach((market) => {
    const prevMarket = previous.markets.find((m) => m.id === market.id);
    if (!prevMarket) {
      console.log(`[new] ${market.id}`);
      newIds.push(market.id);
      return;
    }
    if (JSON.stringify(prevMarket.hours) !== JSON.stringify(market.hours)) {
      console.log(`[changed] ${market.id} hours: ${JSON.stringify(prevMarket.hours)} -> ${JSON.stringify(market.hours)}`);
    }
    if (JSON.stringify(prevMarket.dates) !== JSON.stringify(market.dates)) {
      console.log(`[changed] ${market.id} dates: ${JSON.stringify(prevMarket.dates)} -> ${JSON.stringify(market.dates)}`);
    }
  });
  previous.markets.forEach((prevMarket) => {
    if (!next.markets.find((m) => m.id === prevMarket.id)) {
      console.log(`[removed?] ${prevMarket.id} — check if this is real or a scraper break`);
    }
  });
  return newIds;
}

// Writes to the GitHub Actions run summary (visible in the Actions tab
// without digging through commit diffs) when running in CI. No-op locally.
function reportNewMarkets(next, newIds) {
  if (!process.env.GITHUB_STEP_SUMMARY || newIds.length === 0) return;
  const lines = ["## New Christmas markets found\n"];
  newIds.forEach((id) => {
    const market = next.markets.find((m) => m.id === id);
    lines.push(`- **${market.name}** (${market.district}) — ${market.source.officialUrl}`);
  });
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

function applyOverrides(index, overrides) {
  index.markets.forEach((market) => {
    if (overrides[market.id]) {
      Object.assign(market, overrides[market.id]);
    }
  });
  return index;
}

// Turns every discovered listing card into a source. Markets in STABLE_IDS
// keep their pinned id and organizer URL; nothing else is added by hand.
function mergeSources(stable, discovered) {
  const stableByPath = new Map(stable.map((s) => [new URL(s.officialUrl).pathname, s]));
  const byId = new Map();
  for (const card of discovered) {
    const pinned = stableByPath.get(card.href);
    const id = pinned ? pinned.id : idFromHref(card.href);
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      name: card.name,
      district: card.district,
      summary: stripLeadingDatePhrase(card.teaser) || card.teaser || null,
      officialUrl: `${BASE_URL}${card.href}`,
      organizerUrl: pinned ? pinned.organizerUrl : null,
    });
  }
  for (const pinned of stable) {
    if (![...byId.values()].some((s) => s.officialUrl === pinned.officialUrl)) {
      console.warn(`Pinned market not found in the listings: ${pinned.id}`);
    }
  }
  return [...byId.values()];
}

async function main() {
  const previous = loadPreviousIndex();
  const overrides = loadOverrides();

  console.log("Discovering markets from visitBerlin's district listings...");
  const discovered = await discoverMarketCards("en");
  console.log(`Discovered ${discovered.length} candidate market pages (en).`);
  const sources = mergeSources(STABLE_IDS, discovered);

  console.log("Discovering German listings for bilingual name/summary...");
  const discoveredDe = await discoverMarketCards("de");
  console.log(`Discovered ${discoveredDe.length} candidate market pages (de).`);
  const deIndex = new Map(discoveredDe.map((card) => [card.href, card]));

  const markets = [];
  for (const source of sources) {
    try {
      const market = await scrapeMarket(source, deIndex);
      markets.push(market);
      console.log(`[ok] ${market.id} — status=${market.status} confidence=${market.confidence.source}`);
    } catch (err) {
      console.error(`Failed to scrape ${source.officialUrl}:`, err.message);
      // Keep going — one bad source shouldn't blank the whole index.
    }
    await sleep(200);
  }

  let index = { isSampleData: false, generatedAt: new Date().toISOString(), markets };
  index = applyOverrides(index, overrides);
  const newIds = diffAndWarn(previous, index);
  reportNewMarkets(index, newIds);

  fs.writeFileSync(path.join(DATA_DIR, "markets-index.json"), JSON.stringify(index, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
