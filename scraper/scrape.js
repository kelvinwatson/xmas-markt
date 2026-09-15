// Skeleton scraper.
//
// Goal: write ../data/markets-index.json and ../data/vendors/{id}.json
// in the same shape as the sample data, from real sources.
//
// Suggested source priority (see project notes):
//   1. Official Berlin/Bezirk tourism pages — most authoritative for
//      dates & hours.
//   2. Individual market's own site/social — fastest for closures.
//   3. Aggregator/listicle sites — fine for descriptions only, not
//      for anything time-sensitive.
//
// This file intentionally does not scrape a specific site yet —
// fill in TODOs once real sources are picked, so we're not asserting
// selectors against sites we haven't inspected.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const VENDORS_DIR = path.join(DATA_DIR, "vendors");

async function scrapeMarket(sourceConfig) {
  // TODO: fetch(sourceConfig.url), parse with cheerio, extract:
  //   name, district, lat, lng, dates.start/end, hours per day-group, tags, summary
  throw new Error("Not implemented — fill in per source once picked");
}

async function scrapeVendorsForMarket(sourceConfig) {
  // TODO: same idea, returns { vendors: [{ id, name, category, description, hours }] }
  throw new Error("Not implemented — fill in per source once picked");
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

  // TODO: replace with real source configs once picked.
  const sources = [];

  const markets = [];
  for (const source of sources) {
    try {
      const market = await scrapeMarket(source);
      markets.push(market);
      const vendorData = await scrapeVendorsForMarket(source);
      fs.writeFileSync(
        path.join(VENDORS_DIR, `${market.id}.json`),
        JSON.stringify(
          { marketId: market.id, lastChecked: new Date().toISOString(), vendors: vendorData.vendors },
          null,
          2
        )
      );
    } catch (err) {
      console.error(`Failed to scrape ${source.url}:`, err.message);
      // Keep going — one bad source shouldn't blank the whole index.
    }
  }

  let index = { isSampleData: false, generatedAt: new Date().toISOString(), markets };
  index = applyOverrides(index, overrides);
  diffAndWarn(previous, index);

  fs.writeFileSync(path.join(DATA_DIR, "markets-index.json"), JSON.stringify(index, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
