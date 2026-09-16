// Real scraper, sourced from visitberlin.de — the official Berlin tourism
// site, first in our priority order (official/Bezirk pages > organizer
// site/socials > aggregators, and never aggregators for anything
// time-sensitive; see CLAUDE.md).
//
// What this does NOT do yet: vendor/stall scraping. Per research before
// writing this, none of these four markets publish a scrapable public
// stall directory on their official page (Alexanderplatz's organizer site
// has one, but that's a second source not wired up yet) — so vendor files
// are left untouched here rather than overwritten with something worse
// than the current placeholder data.

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

// Static/editorial fields we curate once per market; the scraper refreshes
// the dynamic fields (dates, hours, coordinates, address, entry, status,
// confidence) from the source URL below.
const SOURCES = [
  {
    id: "gendarmenmarkt",
    name: "Weihnachtsmarkt am Gendarmenmarkt",
    district: "Mitte",
    tags: ["live music", "handicrafts", "ticketed entry"],
    summary:
      "A ticketed market set between the Konzerthaus and the two cathedrals, known for handicraft stalls and a nightly stage programme.",
    vendorFile: "vendors/gendarmenmarkt.json",
    officialUrl: "https://www.visitberlin.de/en/christmas-market-weihnachtszauber-gendarmenmarkt-berlin",
    organizerUrl: "https://www.weihnachtsmarkt-berlin.de/en/",
  },
  {
    id: "alexanderplatz",
    name: "WeihnachtsZauber Alexanderplatz",
    district: "Mitte",
    tags: ["free entry", "large", "rides"],
    summary:
      "One of the city's largest markets, with a big wheel, log-flume ride, and a long row of food stalls beside the TV tower.",
    vendorFile: "vendors/alexanderplatz.json",
    officialUrl: "https://www.visitberlin.de/en/christmas-market-alexanderplatz-berlin",
    organizerUrl: "https://berlinerweihnachtszeit.de/",
  },
  {
    id: "spandau",
    name: "Spandauer Weihnachtsmarkt",
    district: "Spandau",
    tags: ["free entry", "historic old town"],
    summary: "A smaller, quieter market through Spandau's old town lanes, close to the citadel.",
    vendorFile: "vendors/spandau.json",
    officialUrl: "https://www.visitberlin.de/en/spandau-christmas-market",
    organizerUrl: "https://www.altstadt-spandau.de/",
  },
  {
    // Replaces the earlier "schoeneberg" sample entry — research before
    // this scrape found no real market matching that description
    // (Rudolph-Wilde-Park / ice rink) at that location. Breitscheidplatz
    // is one of Berlin's most prominent markets and was suggested as the
    // closer real match for that slot.
    id: "breitscheidplatz",
    name: "Weihnachtsmarkt an der Gedächtniskirche",
    district: "Charlottenburg-Wilmersdorf",
    tags: ["free entry", "landmark", "light installation"],
    summary:
      "A large, central market around the Kaiser Wilhelm Memorial Church, known for its illuminated \"carpet of light\" installation.",
    vendorFile: "vendors/breitscheidplatz.json",
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

// Parses phrases like "23 November to 31 December 2026" or
// "23 November 2026 until 3 January 2027" into { start, end, yearOk }.
// yearOk is false when neither the start nor end year matches SEASON_YEAR
// (e.g. a page that still shows last year's dates) — a signal to mark the
// result "tentative" rather than "confirmed".
function parseDateRange(text) {
  const re =
    /(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?\s+(?:to|until|-|–)\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/;
  const m = text.match(re);
  if (!m) return null;
  const [, d1, mo1, y1, d2, mo2, y2] = m;
  const month1 = MONTHS[mo1.toLowerCase()];
  const month2 = MONTHS[mo2.toLowerCase()];
  if (!month1 || !month2) return null;
  const endYear = y2 ? Number(y2) : SEASON_YEAR;
  const startYear = y1 ? Number(y1) : endYear;
  const start = `${startYear}-${pad2(month1)}-${pad2(d1)}`;
  const end = `${endYear}-${pad2(month2)}-${pad2(d2)}`;
  const yearOk = startYear === SEASON_YEAR || endYear === SEASON_YEAR;
  return { start, end, yearOk };
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
    if (!found && items.some((i) => /^date\s*:/i.test(i))) {
      found = items;
    }
  });
  return found || [];
}

async function scrapeMarket(source) {
  const res = await fetch(source.officialUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${source.officialUrl}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const coords = extractCoords(html);
  if (!coords) throw new Error("Could not find coordinates on page");

  const street = $(".address__street").first().text().trim();
  const zip = $(".address__zip").first().text().replace(/ /g, "").trim();
  const city = $(".address__city").first().text().trim();
  const address = street ? `${street}${zip ? ", " + zip : ""}${city ? " " + city : ""}`.trim() : null;

  const items = extractChecklistWithDate($);
  const dateLine = items.find((i) => /^date\s*:/i.test(i)) || "";
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
    district: source.district,
    address,
    lat: coords.lat,
    lng: coords.lng,
    dates: dateRange ? { start: dateRange.start, end: dateRange.end } : { start: null, end: null },
    hours: hours || { monThu: null, friSat: null, sun: null },
    tags: source.tags,
    summary: source.summary,
    images: [],
    source: {
      officialUrl: source.officialUrl,
      organizerUrl: source.organizerUrl,
      tier: "official",
    },
    status,
    entry,
    confidence: { source: confidenceSource, crowdsource: null },
    vendorFile: source.vendorFile,
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

function diffAndWarn(previous, next) {
  if (!previous) return;
  next.markets.forEach((market) => {
    const prevMarket = previous.markets.find((m) => m.id === market.id);
    if (!prevMarket) {
      console.log(`[new] ${market.id}`);
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
}

function applyOverrides(index, overrides) {
  index.markets.forEach((market) => {
    if (overrides[market.id]) {
      Object.assign(market, overrides[market.id]);
    }
  });
  return index;
}

async function main() {
  const previous = loadPreviousIndex();
  const overrides = loadOverrides();

  const markets = [];
  for (const source of SOURCES) {
    try {
      const market = await scrapeMarket(source);
      markets.push(market);
      console.log(`[ok] ${market.id} — status=${market.status} confidence=${market.confidence.source}`);
    } catch (err) {
      console.error(`Failed to scrape ${source.officialUrl}:`, err.message);
      // Keep going — one bad source shouldn't blank the whole index.
    }
  }

  let index = { isSampleData: false, generatedAt: new Date().toISOString(), markets };
  index = applyOverrides(index, overrides);
  diffAndWarn(previous, index);

  fs.writeFileSync(path.join(DATA_DIR, "markets-index.json"), JSON.stringify(index, null, 2) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
