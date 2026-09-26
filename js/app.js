(() => {
  "use strict";

  // Registered immediately, independent of the rest of app init — this
  // used to sit at the tail end of init(), gated behind an await'd network
  // fetch and map setup, which delayed it enough that automated PWA
  // checkers (PWABuilder's crawler) timed out before ever seeing it.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Privacy-first analytics via GoatCounter: no cookies, no localStorage,
  // no persistent ID, no IP stored — so no consent banner is needed. Leave
  // the code empty and nothing loads at all. Events are aggregate counts
  // only; never attach anything identifying to them.
  const GOATCOUNTER_CODE = "syntheticsystems";
  if (GOATCOUNTER_CODE) {
    const gc = document.createElement("script");
    gc.async = true;
    gc.src = "https://gc.zgo.at/count.js";
    gc.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
    document.head.appendChild(gc);
  }

  function track(event, detail) {
    try {
      const path = detail ? `${event}/${detail}` : event;
      if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path, title: event, event: true });
      }
    } catch {
      // analytics must never break the app
    }
  }

  const FAVORITES_KEY = "cmapp_favorites";
  const THEME_KEY = "cmapp_theme";
  const LANG_KEY = "cmapp_lang";
  const BERLIN_CENTER = [52.517, 13.389];

  // ---------------------------------------------------------
  // Language (UI chrome only — market names/summaries/vendor data
  // stay as scraped, since translating that is scraper work, not a
  // toggle; see CLAUDE.md)
  // ---------------------------------------------------------
  const STRINGS = {
    en: {
      tagline: "Every Christmas market in Berlin, mapped.",
      map: "Map",
      list: "List",
      saved: "Saved",
      toggleTheme: "Toggle dark mode",
      switchLang: "Switch language",
      sendFeedback: "Send feedback",
      shareApp: "Share XmasMarkt",
      feedbackSubject: "XmasMarkt feedback",
      feedbackBody: "What's on your mind? (Missing market, wrong info, general feedback — anything goes.)",
      privacy: "Privacy",
      shareBannerPrompt: "Report this as a missing market?",
      shareBannerSend: "Send as feedback",
      missingMarketSubject: "XmasMarkt — missing market",
      missingMarketBody: (shared) => `I think this market is missing from the app:\n\n${shared}`,
      addToCalendar: "Add to calendar",
      shareMarket: "Share market",
      saveMarket: "Save market",
      close: "Close",
      noSaved: "No saved markets yet. Tap the heart on a market to save it.",
      noMarkets: "No markets found.",
      allDistricts: "All districts",
      filterDistrict: "Filter by district",
      filterEntry: "Filter by entry",
      entryAll: "All entry",
      entryFree: "Free",
      entryTicketed: "Ticketed",
      sortBy: "Sort",
      sortRecommended: "Recommended",
      sortEnding: "Ending soonest",
      sortName: "Name (A–Z)",
      sortNearest: "Nearest to me",
      locateMe: "Show my location",
      locateDenied: "Couldn't get your location — check your browser's location permission.",
      distanceAway: (km) => `${km} km away`,
      loadingVendors: "Loading vendors…",
      vendorError: "Couldn't load vendor details right now.",
      lastChecked: (t) => `Vendor list last checked ${t}`,
      dataChecked: (t) => `Data refreshed ${t}`,
      runs: (start, end) => `Runs ${start} – ${end}`,
      openNow: (end) => `Open now · closes ${end}`,
      closedOpens: (start) => `Closed · opens ${start}`,
      datesUnknown: "Check dates on the official site",
      datesTbd: "New dates not yet announced",
      hoursUnknown: "Hours not listed — check ahead",
      groupFood: "Food & drink",
      groupCrafts: "Gifts & crafts",
      groupActivity: "Things to do",
      minAgo: (n) => `${n} min ago`,
      hAgo: (n) => `${n}h ago`,
      dAgo: (n) => `${n}d ago`,
      dateLocale: "en-GB",
    },
    de: {
      tagline: "Jeder Weihnachtsmarkt in Berlin, verzeichnet.",
      map: "Karte",
      list: "Liste",
      saved: "Gemerkt",
      toggleTheme: "Dunkelmodus umschalten",
      switchLang: "Sprache wechseln",
      sendFeedback: "Feedback senden",
      shareApp: "XmasMarkt teilen",
      feedbackSubject: "XmasMarkt Feedback",
      feedbackBody: "Was möchtest du uns mitteilen? (Fehlender Markt, falsche Angaben, allgemeines Feedback — alles willkommen.)",
      privacy: "Datenschutz",
      shareBannerPrompt: "Als fehlenden Markt melden?",
      shareBannerSend: "Als Feedback senden",
      missingMarketSubject: "XmasMarkt — fehlender Markt",
      missingMarketBody: (shared) => `Ich glaube, dieser Markt fehlt in der App:\n\n${shared}`,
      addToCalendar: "Zum Kalender hinzufügen",
      shareMarket: "Markt teilen",
      saveMarket: "Markt merken",
      close: "Schließen",
      noSaved: "Noch keine gemerkten Märkte. Tippe auf das Herz, um einen Markt zu merken.",
      noMarkets: "Keine Märkte gefunden.",
      allDistricts: "Alle Bezirke",
      filterDistrict: "Nach Bezirk filtern",
      filterEntry: "Nach Eintritt filtern",
      entryAll: "Jeder Eintritt",
      entryFree: "Kostenlos",
      entryTicketed: "Kostenpflichtig",
      sortBy: "Sortieren",
      sortRecommended: "Empfohlen",
      sortEnding: "Endet bald",
      sortName: "Name (A–Z)",
      sortNearest: "In meiner Nähe",
      locateMe: "Meinen Standort anzeigen",
      locateDenied: "Standort konnte nicht ermittelt werden — bitte Standortberechtigung im Browser prüfen.",
      distanceAway: (km) => `${km} km entfernt`,
      loadingVendors: "Stände werden geladen…",
      vendorError: "Standdetails konnten nicht geladen werden.",
      lastChecked: (t) => `Standliste zuletzt geprüft ${t}`,
      dataChecked: (t) => `Daten aktualisiert ${t}`,
      runs: (start, end) => `${start} – ${end}`,
      openNow: (end) => `Jetzt geöffnet · schließt ${end}`,
      closedOpens: (start) => `Geschlossen · öffnet ${start}`,
      datesUnknown: "Termine auf der offiziellen Seite prüfen",
      datesTbd: "Neue Termine noch nicht bekannt",
      hoursUnknown: "Öffnungszeiten nicht gelistet — bitte vorher prüfen",
      groupFood: "Essen & Trinken",
      groupCrafts: "Geschenke & Kunsthandwerk",
      groupActivity: "Unternehmungen",
      minAgo: (n) => `vor ${n} Min.`,
      hAgo: (n) => `vor ${n} Std.`,
      dAgo: (n) => `vor ${n} Tag(en)`,
      dateLocale: "de-DE",
    },
  };

  let lang = localStorage.getItem(LANG_KEY) || (navigator.language.toLowerCase().startsWith("de") ? "de" : "en");

  function t(key, ...args) {
    const val = STRINGS[lang][key];
    return typeof val === "function" ? val(...args) : val;
  }

  // Market name/summary are scraped bilingually (nameDe/summaryDe), unlike
  // UI chrome strings which come from STRINGS above — these pick the
  // current-language variant when one was actually scraped, falling back
  // to English rather than showing nothing when a German version wasn't
  // found for a given market.
  // mailto: needs %20 for spaces (RFC 6068). URLSearchParams writes "+",
  // which mail apps show literally, so encode by hand.
  function mailtoUrl(subject, body) {
    return `mailto:xmasmarktde@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function marketName(market) {
    return (lang === "de" && market.nameDe) || market.name;
  }
  function marketSummary(market) {
    return (lang === "de" && market.summaryDe) || market.summary;
  }

  function applyStaticStrings() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      el.setAttribute("aria-label", t(el.dataset.i18nAria));
    });
    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) langBtn.textContent = lang === "de" ? "EN" : "DE";

    renderDataChecked();

    const feedbackBtn = document.getElementById("feedback-toggle");
    if (feedbackBtn) {
      feedbackBtn.href = mailtoUrl(t("feedbackSubject"), t("feedbackBody"));
    }
  }
  const PINE_ICON = `<svg width="13" height="13" viewBox="0 0 16 16"><path d="M8 15 V2 M8 4.5 L4.3 7 M8 4.5 L11.7 7 M8 8 L4.3 10.5 M8 8 L11.7 10.5 M8 2 L6.2 0.5 M8 2 L9.8 0.5" stroke="var(--pine)" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>`;
  const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>`;
  const PLACEHOLDER_ICON = `<img src="icons/icon-192.png" alt="">`;

  // Scraped market photos are hotlinked from visitBerlin's own CDN, so a
  // link can go stale or 404 — fall back to the placeholder icon rather
  // than showing a broken-image glyph. Exposed on window since inline
  // onerror="" attributes run outside this IIFE's closure.
  window.xmImgFallback = function (img, blockClass) {
    const placeholder = document.createElement("div");
    placeholder.className = `${blockClass}__placeholder`;
    placeholder.innerHTML = PLACEHOLDER_ICON;
    img.replaceWith(placeholder);
  };

  function mediaHtml(market, blockClass) {
    const src = market.images && market.images[0];
    if (src) {
      return `<img class="${blockClass}__img" src="${src}" alt="" onerror="xmImgFallback(this, '${blockClass}')">`;
    }
    return `<div class="${blockClass}__placeholder">${PLACEHOLDER_ICON}</div>`;
  }

  function bannerCarouselHtml(market) {
    const images = market.images && market.images.length ? market.images : null;
    if (!images) {
      return `<div class="sheet__banner__placeholder">${PLACEHOLDER_ICON}</div>`;
    }
    const slides = images
      .map(
        (src) =>
          `<div class="sheet__banner__slide"><img class="sheet__banner__img" src="${src}" alt="" onerror="xmImgFallback(this, 'sheet__banner')"></div>`
      )
      .join("");
    const dots =
      images.length > 1
        ? `<div class="sheet__banner__dots">${images
            .map((_, i) => `<span class="sheet__banner__dot${i === 0 ? " active" : ""}"></span>`)
            .join("")}</div>`
        : "";
    return `<div class="sheet__banner__track">${slides}</div>${dots}`;
  }

  function initBannerCarousel() {
    const track = document.querySelector("#sheet-banner .sheet__banner__track");
    const dots = document.querySelectorAll("#sheet-banner .sheet__banner__dot");
    if (!track || !dots.length) return;
    track.addEventListener("scroll", () => {
      const index = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
    });
  }

  let markets = [];
  let dataGeneratedAt = null;
  let currentView = "map";
  let savedOnly = false;
  let filterDistrict = "all";
  let filterEntry = "all";
  let sortBy = "recommended";
  let userLocation = null; // { lat, lng } once geolocation succeeds
  let map, markerLayer, userMarker;
  const markerById = new Map();
  const vendorCache = new Map();

  // ---------------------------------------------------------
  // Favorites (localStorage — per device, no account needed)
  // ---------------------------------------------------------
  function getFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }

  function saveFavorites(set) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  }

  function toggleFavorite(id) {
    const favs = getFavorites();
    favs.has(id) ? favs.delete(id) : favs.add(id);
    saveFavorites(favs);
    if (favs.has(id)) track("market-saved", id);
    return favs.has(id);
  }

  // ---------------------------------------------------------
  // Hours / open-now logic
  // ---------------------------------------------------------
  function hoursForToday(market) {
    const day = new Date().getDay(); // 0 Sun .. 6 Sat
    if (day === 0) return market.hours.sun;
    if (day === 6) return market.hours.friSat;
    if (day === 5) return market.hours.friSat;
    return market.hours.monThu;
  }

  function parseRange(rangeStr) {
    const [start, end] = rangeStr.split(/[–-]/).map((s) => s.trim());
    return { start, end };
  }

  function timeToMinutes(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  }

  function isWithinDateRange(market) {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return today >= market.dates.start && today <= market.dates.end;
  }

  function marketStatus(market) {
    // "tentative" means the source page still shows last season's dates, so
    // showing them (year-less) would mislead — say new dates aren't out yet.
    if (market.status === "tentative") {
      return { open: false, tbd: true, label: t("datesTbd") };
    }
    if (!market.dates.start || !market.dates.end) {
      return { open: false, tbd: true, label: t("datesUnknown") };
    }
    if (!isWithinDateRange(market)) {
      return { open: false, label: t("runs", formatDateShort(market.dates.start), formatDateShort(market.dates.end)) };
    }
    const todayHours = hoursForToday(market);
    if (!todayHours) {
      return { open: false, label: t("hoursUnknown") };
    }
    const { start, end } = parseRange(todayHours);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (nowMin >= startMin && nowMin < endMin) {
      return { open: true, label: t("openNow", end) };
    }
    return { open: false, label: t("closedOpens", start) };
  }

  function formatDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(t("dateLocale"), { day: "numeric", month: "short" });
  }

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return t("minAgo", mins);
    const hours = Math.round(mins / 60);
    if (hours < 24) return t("hAgo", hours);
    return t("dAgo", Math.round(hours / 24));
  }

  // ---------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------
  async function loadMarkets() {
    // no-store: this data changes with each scrape, and the service
    // worker's own network-first handling for /data/ shouldn't be
    // defeated by the browser's HTTP cache serving a stale response here.
    const res = await fetch("data/markets-index.json", { cache: "no-store" });
    const data = await res.json();
    markets = data.markets;
    dataGeneratedAt = data.generatedAt || null;
    renderDataChecked();
  }

  // Shows when the scraper last ran (not when a market's details last
  // changed at the source) — so if scraping breaks, users can see the
  // data is stale instead of trusting it blindly.
  function renderDataChecked() {
    const el = document.getElementById("data-updated");
    if (!el || !dataGeneratedAt) return;
    // The scraper runs once a day, so up to ~30h is on schedule (a little
    // slack for a delayed run); a missed day is "aging", beyond 3 days
    // something is clearly wrong.
    const hours = (Date.now() - new Date(dataGeneratedAt).getTime()) / 3600000;
    el.dataset.state = hours <= 30 ? "fresh" : hours <= 72 ? "aging" : "stale";
    el.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${t("dataChecked", relativeTime(dataGeneratedAt))}</span>`;
    el.title = new Date(dataGeneratedAt).toLocaleString(t("dateLocale"), { dateStyle: "medium", timeStyle: "short" });
    el.hidden = false;
  }

  async function loadVendors(market) {
    if (vendorCache.has(market.id)) return vendorCache.get(market.id);
    const res = await fetch(`data/${market.vendorFile}`, { cache: "no-store" });
    const data = await res.json();
    vendorCache.set(market.id, data);
    return data;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function distanceToMarket(market) {
    if (!userLocation) return null;
    return haversineKm(userLocation.lat, userLocation.lng, market.lat, market.lng);
  }

  // Markets with an unparseable date (recurring/weekend-only events that
  // don't fit the "DD Month to DD Month YYYY" pattern) have null start/end
  // — sort those last rather than crashing or lexically ahead of real dates.
  function compareDates(a, b) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  }

  // Current/upcoming dates first, then markets that already ended, then ones
  // whose new dates aren't announced, then ones with no parseable dates —
  // so the top of the list is what a visitor can actually go to.
  function dateRank(market) {
    if (market.status === "unavailable" || !market.dates.start || !market.dates.end) return 4;
    if (market.status === "tentative") return 3;
    const today = new Date().toISOString().slice(0, 10);
    return market.dates.end >= today ? 1 : 2;
  }

  function sortMarkets(list) {
    const sorted = list.slice();
    if (sortBy === "name") {
      sorted.sort((a, b) => marketName(a).localeCompare(marketName(b)));
    } else if (sortBy === "ending") {
      sorted.sort((a, b) => dateRank(a) - dateRank(b) || compareDates(a.dates.end, b.dates.end));
    } else if (sortBy === "nearest" && userLocation) {
      sorted.sort((a, b) => distanceToMarket(a) - distanceToMarket(b));
    } else {
      // Recommended: open-now markets first, then soonest start date.
      sorted.sort((a, b) => {
        const aOpen = marketStatus(a).open;
        const bOpen = marketStatus(b).open;
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return dateRank(a) - dateRank(b) || compareDates(a.dates.start, b.dates.start);
      });
    }
    return sorted;
  }

  function visibleMarkets() {
    const favs = getFavorites();
    let list = savedOnly ? markets.filter((m) => favs.has(m.id)) : markets;
    if (filterDistrict !== "all") list = list.filter((m) => m.district === filterDistrict);
    if (filterEntry !== "all") list = list.filter((m) => m.entry === filterEntry);
    return sortMarkets(list);
  }

  function populateDistrictFilter() {
    const container = document.getElementById("filter-district");
    const districts = [...new Set(markets.map((m) => m.district))].sort();
    const options = ["all", ...districts];
    container.innerHTML = options
      .map(
        (d) =>
          `<button class="filter-pill" data-value="${d}" aria-pressed="${String(d === filterDistrict)}">${
            d === "all" ? t("allDistricts") : d
          }</button>`
      )
      .join("");
    container.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterDistrict = btn.dataset.value;
        track("filter-district", filterDistrict);
        container.querySelectorAll(".filter-pill").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        refreshCurrentView();
      });
    });
  }

  function locateUser() {
    if (!map) return;
    track("locate-me");
    map.locate({ setView: true, maxZoom: 15, enableHighAccuracy: true });
  }

  // ---------------------------------------------------------
  // Map view
  // ---------------------------------------------------------
  function initMap() {
    map = L.map("map", { zoomControl: true }).setView(BERLIN_CENTER, 11);
    // CartoDB's free dark-tile endpoint now requires an API key (renders a
    // watermark without one) — stick with plain OSM tiles, which stay free
    // and unauthenticated, and darken them with a CSS filter instead.
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
      className: "map-tiles-theme",
    }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    renderMarkers();
    map.addControl(new LocateControl());

    map.on("locationfound", (e) => {
      userLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
      renderUserMarker(e.latlng);
      if (sortBy === "nearest") refreshCurrentView();
    });

    map.on("locationerror", () => {
      const btn = document.querySelector(".map-locate-btn");
      if (!btn) return;
      btn.classList.add("map-locate-btn--error");
      btn.title = t("locateDenied");
      setTimeout(() => btn.classList.remove("map-locate-btn--error"), 2000);
    });
  }

  function markerIcon(isFav) {
    return L.divIcon({
      className: "",
      html: `<div class="market-marker${isFav ? " market-marker--fav" : ""}"></div>`,
      iconSize: [16, 16],
    });
  }

  const LOCATE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg>`;

  const LocateControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const btn = L.DomUtil.create("button", "leaflet-bar map-locate-btn");
      btn.type = "button";
      btn.innerHTML = LOCATE_ICON;
      btn.setAttribute("aria-label", t("locateMe"));
      btn.title = t("locateMe");
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", locateUser);
      return btn;
    },
  });

  function userLocationIcon() {
    return L.divIcon({
      className: "",
      html: `<div class="user-location-marker"><div class="user-location-marker__dot"></div></div>`,
      iconSize: [18, 18],
    });
  }

  function renderUserMarker(latlng) {
    if (userMarker) {
      userMarker.setLatLng(latlng);
    } else {
      userMarker = L.marker(latlng, { icon: userLocationIcon(), zIndexOffset: 1000 }).addTo(map);
    }
  }

  function renderMarkers() {
    markerLayer.clearLayers();
    markerById.clear();
    const favs = getFavorites();
    visibleMarkets().forEach((market) => {
      const marker = L.marker([market.lat, market.lng], {
        icon: markerIcon(favs.has(market.id)),
      });
      marker.on("click", () => openSheet(market));
      marker.addTo(markerLayer);
      markerById.set(market.id, marker);
    });
  }

  // ---------------------------------------------------------
  // List view
  // ---------------------------------------------------------
  function renderList() {
    const container = document.getElementById("list-view");
    const items = visibleMarkets();
    const favs = getFavorites();

    if (items.length === 0) {
      container.innerHTML = `<p class="empty-state">${savedOnly ? t("noSaved") : t("noMarkets")}</p>`;
      return;
    }

    container.innerHTML = items
      .map((market) => {
        const status = marketStatus(market);
        const isFav = favs.has(market.id);
        return `
        <button class="market-card ${status.open ? "" : "market-card--closed"}" data-id="${market.id}">
          <div class="market-card__row">
            <div class="market-card__thumb">${mediaHtml(market, "market-card__thumb")}</div>
            <div class="market-card__content">
              <div class="market-card__top">
                <div>
                  <p class="market-card__name">${marketName(market)}</p>
                  <p class="market-card__district">${PINE_ICON}${market.district}</p>
                </div>
                <span class="fav-btn" data-fav-id="${market.id}" aria-pressed="${isFav}">${isFav ? "♥" : "♡"}</span>
              </div>
              <p class="market-card__status ${status.open ? "market-card__status--open" : status.tbd ? "market-card__status--tbd" : "market-card__status--closed"}">${status.label}</p>
              <p class="market-card__summary">${marketSummary(market) || ""}</p>
            </div>
          </div>
        </button>`;
      })
      .join("");
    container.insertAdjacentHTML("beforeend", `<p class="list-footer"><a href="privacy.html">${t("privacy")}</a></p>`);

    container.querySelectorAll(".market-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".fav-btn")) return;
        const market = markets.find((m) => m.id === card.dataset.id);
        openSheet(market);
      });
    });

    container.querySelectorAll(".fav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.favId;
        toggleFavorite(id);
        refreshCurrentView();
      });
    });
  }

  // ---------------------------------------------------------
  // Detail sheet
  // ---------------------------------------------------------
  let currentSheetMarket = null;

  async function openSheet(market, { updateHistory = true } = {}) {
    // Re-renders for the same market (e.g. language toggle) aren't a new open.
    if (currentSheetMarket !== market) track("market-opened", market.id);
    currentSheetMarket = market;
    const overlay = document.getElementById("sheet-overlay");
    const status = marketStatus(market);
    const favs = getFavorites();
    const isFav = favs.has(market.id);

    document.getElementById("sheet-title").textContent = marketName(market);
    document.getElementById("sheet-meta").innerHTML =
      `${PINE_ICON}${market.district} · <span class="sheet__status ${status.open ? "sheet__status--open" : status.tbd ? "sheet__status--tbd" : "sheet__status--closed"}">${status.label}</span>`;

    document.getElementById("sheet-banner").innerHTML = bannerCarouselHtml(market);
    initBannerCarousel();

    const addressEl = document.getElementById("sheet-address");
    if (market.address) {
      addressEl.href = `https://www.google.com/maps/search/?api=1&query=${market.lat},${market.lng}`;
      addressEl.innerHTML = `${PIN_ICON}${market.address}`;
      addressEl.hidden = false;
    } else {
      addressEl.hidden = true;
    }

    const favBtn = document.getElementById("sheet-fav-btn");
    favBtn.textContent = isFav ? "♥" : "♡";
    favBtn.setAttribute("aria-pressed", String(isFav));
    favBtn.onclick = () => {
      const nowFav = toggleFavorite(market.id);
      favBtn.textContent = nowFav ? "♥" : "♡";
      favBtn.setAttribute("aria-pressed", String(nowFav));
      renderMarkers();
      if (currentView === "list") renderList();
    };

    const calendarBtn = document.getElementById("sheet-calendar-btn");
    calendarBtn.onclick = () => track("calendar-added", market.id);
    if (market.dates.start && market.dates.end && market.status !== "tentative") {
      calendarBtn.href = calendarUrl(market);
      calendarBtn.hidden = false;
    } else {
      calendarBtn.hidden = true;
    }

    const shareBtn = document.getElementById("sheet-share-btn");
    shareBtn.onclick = () => shareMarket(market, shareBtn);

    if (updateHistory) history.pushState(null, "", `#${market.id}`);

    const body = document.getElementById("sheet-body");
    const summaryHtml = `<p class="sheet__summary">${marketSummary(market) || ""}</p>`;
    body.innerHTML = summaryHtml;

    overlay.hidden = false;

    // Markets without a vendorFile (everything auto-discovered beyond the
    // hand-curated few) simply have no vendor data yet — skip the
    // loading/error UI entirely rather than showing an error for data that
    // was never expected to exist.
    if (!market.vendorFile) return;

    body.innerHTML = `${summaryHtml}<div class="sheet__loading">${t("loadingVendors")}</div>`;

    try {
      const vendorData = await loadVendors(market);
      const groups = {};
      vendorData.vendors.forEach((v) => {
        (groups[v.category] ||= []).push(v);
      });

      const groupLabels = { food: t("groupFood"), crafts: t("groupCrafts"), activity: t("groupActivity") };

      const vendorsHtml = Object.entries(groups)
        .map(
          ([cat, items]) => `
          <p class="vendor-group__title">${groupLabels[cat] || cat}</p>
          ${items
            .map(
              (v) => `
            <div class="vendor-item">
              <p class="vendor-item__name">${v.name}</p>
              <p class="vendor-item__desc">${v.description}</p>
              <p class="vendor-item__hours">${v.hours}</p>
            </div>`
            )
            .join("")}
        `
        )
        .join("");

      body.innerHTML = `
        ${summaryHtml}
        ${vendorsHtml}
        <p class="sheet__last-checked">${t("lastChecked", relativeTime(vendorData.lastChecked))}</p>
      `;
    } catch {
      body.innerHTML = `
        ${summaryHtml}
        <p class="sheet__error">${t("vendorError")}</p>
      `;
    }
  }

  function isoToYyyymmdd(iso) {
    return iso.replace(/-/g, "");
  }

  function isoPlusOneDay(iso) {
    // Build the result from local date parts, not toISOString() (which
    // converts to UTC and rolls the date back a day in any positive
    // UTC-offset timezone, e.g. Berlin).
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function calendarUrl(market) {
    // Google Calendar all-day events use an EXCLUSIVE end date, so the
    // event has to end the day after the market's actual last day to
    // display through it correctly.
    const start = isoToYyyymmdd(market.dates.start);
    const end = isoToYyyymmdd(isoPlusOneDay(market.dates.end));
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: marketName(market),
      dates: `${start}/${end}`,
      details: marketSummary(market) || "",
      location: market.address || `${market.district}, Berlin`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function shareMarket(market, btn) {
    track("market-shared", market.id);
    const url = `${location.origin}${location.pathname}#${market.id}`;
    if (navigator.share) {
      navigator.share({ title: marketName(market), text: marketSummary(market) || "", url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1500);
    });
  }

  function initShareBanner(sharedText) {
    const banner = document.getElementById("share-banner");
    document.getElementById("share-banner-text").textContent = `${t("shareBannerPrompt")} ${sharedText}`;
    banner.hidden = false;
    track("shared-into-app");

    document.getElementById("share-banner-send").onclick = () => {
      track("shared-into-app-sent");
      // New tab, so a web mail handler (e.g. Gmail) doesn't replace the app.
      window.open(mailtoUrl(t("missingMarketSubject"), t("missingMarketBody", sharedText)), "_blank", "noopener");
      banner.hidden = true;
    };
    document.getElementById("share-banner-dismiss").onclick = () => {
      banner.hidden = true;
    };
  }

  function closeSheet() {
    currentSheetMarket = null;
    document.getElementById("sheet-overlay").hidden = true;
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
  }

  // ---------------------------------------------------------
  // Sheet drag-to-dismiss (mobile only — desktop uses the centered
  // modal's overlay click / close button instead)
  // ---------------------------------------------------------
  function initSheetDragToDismiss() {
    // Draggable from the handle or anywhere in the header bar — but not
    // from the fav/close buttons inside it, so those stay tappable.
    const dragSources = [
      document.querySelector(".sheet__handle"),
      document.querySelector(".sheet__header"),
    ];
    const sheetEl = document.getElementById("sheet");
    const DISMISS_THRESHOLD = 90;
    let startY = null;
    let activeSource = null;

    dragSources.forEach((source) => {
      source.addEventListener("pointerdown", (e) => {
        if (matchMedia("(min-width: 720px)").matches) return;
        if (e.target.closest("button")) return;
        startY = e.clientY;
        activeSource = source;
        sheetEl.style.transition = "none";
        source.setPointerCapture(e.pointerId);
      });

      source.addEventListener("pointermove", (e) => {
        if (startY === null || activeSource !== source) return;
        const delta = Math.max(0, e.clientY - startY);
        sheetEl.style.transform = `translateY(${delta}px)`;
      });

      function endDrag(e) {
        if (startY === null || activeSource !== source) return;
        const delta = Math.max(0, e.clientY - startY);
        startY = null;
        activeSource = null;
        sheetEl.style.transition = "";
        sheetEl.style.transform = "";
        if (delta > DISMISS_THRESHOLD) closeSheet();
      }

      source.addEventListener("pointerup", endDrag);
      source.addEventListener("pointercancel", endDrag);
    });
  }

  // ---------------------------------------------------------
  // View switching
  // ---------------------------------------------------------
  function setView(view) {
    currentView = view;
    document.getElementById("map-view").hidden = view !== "map";
    document.getElementById("list-view").hidden = view !== "list";
    // Sort order has no visual meaning on the map (pins don't reorder), so
    // hide it there on mobile's tab-switched views — but desktop's split
    // layout always shows the list alongside the map, so a CSS override
    // (below) keeps it visible there regardless of this class.
    document.getElementById("sort-by").classList.toggle("is-hidden", view !== "list");
    document.querySelectorAll(".view-switch__btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.view === view));
    });
    // Desktop's split layout shows both panes at once via CSS regardless
    // of `view` (the tabs that drive `view` are hidden there), so both
    // must be kept rendered — not just whichever one is "active", or the
    // other pane silently goes stale (or on first load, never renders at
    // all).
    const isDesktop = matchMedia("(min-width: 720px)").matches;
    if (view === "map" || isDesktop) {
      renderMarkers();
      setTimeout(() => map && map.invalidateSize(), 0);
    }
    if (view === "list" || isDesktop) {
      renderList();
    }
  }

  function refreshCurrentView() {
    setView(currentView);
  }

  // ---------------------------------------------------------
  // Init
  // ---------------------------------------------------------
  async function init() {
    applyStaticStrings();
    await loadMarkets();

    // Supports the manifest's home-screen shortcuts (Map / List / Saved
    // markets) — ?view=list and &saved=true launch straight into that view.
    const launchParams = new URLSearchParams(location.search);
    if (launchParams.get("saved") === "true") {
      savedOnly = true;
      document.getElementById("saved-toggle").setAttribute("aria-pressed", "true");
    }
    if (launchParams.get("view") === "list") currentView = "list";

    // Web Share Target: the OS share sheet can open the app with a shared
    // link/text (e.g. a post about a market that isn't in the app yet).
    // Show a confirm-before-send prompt rather than firing off the
    // feedback email automatically — the user should see exactly what's
    // about to be sent.
    const sharedParts = [launchParams.get("title"), launchParams.get("text"), launchParams.get("url")].filter(
      Boolean
    );
    if (sharedParts.length) initShareBanner(sharedParts.join(" — "));

    initMap();
    populateDistrictFilter();
    setView(currentView);

    // Whether both panes render depends on the split-layout breakpoint, so
    // re-render when it's crossed after load (window resize, tablet rotate).
    matchMedia("(min-width: 720px)").addEventListener("change", refreshCurrentView);

    document.querySelectorAll("#filter-entry .filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        filterEntry = btn.dataset.value;
        track("filter-entry", filterEntry);
        document
          .querySelectorAll("#filter-entry .filter-pill")
          .forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        refreshCurrentView();
      });
    });

    document.getElementById("sort-by").addEventListener("change", (e) => {
      sortBy = e.target.value;
      track("sort", sortBy);
      if (sortBy === "nearest" && !userLocation) locateUser();
      refreshCurrentView();
    });

    document.querySelectorAll(".view-switch__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        track("view", btn.dataset.view);
        setView(btn.dataset.view);
      });
    });

    const savedToggle = document.getElementById("saved-toggle");
    savedToggle.addEventListener("click", () => {
      savedOnly = !savedOnly;
      if (savedOnly) track("saved-view");
      savedToggle.setAttribute("aria-pressed", String(savedOnly));
      refreshCurrentView();
    });

    document.getElementById("feedback-toggle").addEventListener("click", () => track("feedback-tapped"));

    // Share the site itself (as opposed to one market, which the detail
    // sheet handles). Native share sheet where available, else copy the link.
    const shareAppBtn = document.getElementById("share-app-toggle");
    shareAppBtn.addEventListener("click", () => {
      track("app-shared");
      const data = { title: "XmasMarkt", text: t("tagline"), url: "https://xmas-markt.de/" };
      if (navigator.share) {
        navigator.share(data).catch(() => {});
        return;
      }
      navigator.clipboard.writeText(data.url).then(() => {
        shareAppBtn.classList.add("copied");
        setTimeout(() => shareAppBtn.classList.remove("copied"), 1500);
      });
    });

    document.getElementById("sheet-close").addEventListener("click", closeSheet);
    document.getElementById("sheet-overlay").addEventListener("click", (e) => {
      if (e.target.id === "sheet-overlay") closeSheet();
    });

    initSheetDragToDismiss();

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      track("theme", next);
      document.querySelector('meta[name="theme-color"]').setAttribute(
        "content",
        next === "dark" ? "#10182D" : "#FBF8F1"
      );
    });

    document.getElementById("lang-toggle").addEventListener("click", () => {
      lang = lang === "de" ? "en" : "de";
      localStorage.setItem(LANG_KEY, lang);
      track("lang", lang);
      applyStaticStrings();
      populateDistrictFilter();
      refreshCurrentView();
      if (currentSheetMarket) openSheet(currentSheetMarket, { updateHistory: false });
    });

    window.addEventListener("popstate", () => {
      const market = markets.find((m) => m.id === location.hash.slice(1));
      if (market) openSheet(market, { updateHistory: false });
      else document.getElementById("sheet-overlay").hidden = true;
    });

    const deepLinked = markets.find((m) => m.id === location.hash.slice(1));
    if (deepLinked) openSheet(deepLinked, { updateHistory: false });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
