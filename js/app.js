(() => {
  "use strict";

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
      addToCalendar: "Add to calendar",
      shareMarket: "Share market",
      saveMarket: "Save market",
      close: "Close",
      noSaved: "No saved markets yet. Tap the heart on a market to save it.",
      noMarkets: "No markets found.",
      loadingVendors: "Loading vendors…",
      vendorError: "Couldn't load vendor details right now.",
      lastChecked: (t) => `Vendor list last checked ${t}`,
      runs: (start, end) => `Runs ${start} – ${end}`,
      openNow: (end) => `Open now · closes ${end}`,
      closedOpens: (start) => `Closed · opens ${start}`,
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
      addToCalendar: "Zum Kalender hinzufügen",
      shareMarket: "Markt teilen",
      saveMarket: "Markt merken",
      close: "Schließen",
      noSaved: "Noch keine gemerkten Märkte. Tippe auf das Herz, um einen Markt zu merken.",
      noMarkets: "Keine Märkte gefunden.",
      loadingVendors: "Stände werden geladen…",
      vendorError: "Standdetails konnten nicht geladen werden.",
      lastChecked: (t) => `Standliste zuletzt geprüft ${t}`,
      runs: (start, end) => `${start} – ${end}`,
      openNow: (end) => `Jetzt geöffnet · schließt ${end}`,
      closedOpens: (start) => `Geschlossen · öffnet ${start}`,
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
  }
  const PINE_ICON = `<svg width="13" height="13" viewBox="0 0 16 16"><path d="M8 15 V2 M8 4.5 L4.3 7 M8 4.5 L11.7 7 M8 8 L4.3 10.5 M8 8 L11.7 10.5 M8 2 L6.2 0.5 M8 2 L9.8 0.5" stroke="var(--pine)" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>`;
  const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--gold-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.1 7-12a7 7 0 10-14 0c0 5.9 7 12 7 12z"/><circle cx="12" cy="9" r="2.3"/></svg>`;
  const PLACEHOLDER_ICON = `<img src="icons/icon-192.png" alt="">`;

  function mediaHtml(market, blockClass) {
    const src = market.images && market.images[0];
    if (src) {
      return `<img class="${blockClass}__img" src="${src}" alt="">`;
    }
    return `<div class="${blockClass}__placeholder">${PLACEHOLDER_ICON}</div>`;
  }

  function bannerCarouselHtml(market) {
    const images = market.images && market.images.length ? market.images : null;
    if (!images) {
      return `<div class="sheet__banner__placeholder">${PLACEHOLDER_ICON}</div>`;
    }
    const slides = images
      .map((src) => `<div class="sheet__banner__slide"><img class="sheet__banner__img" src="${src}" alt=""></div>`)
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
  let currentView = "map";
  let savedOnly = false;
  let map, markerLayer;
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
    if (!isWithinDateRange(market)) {
      return { open: false, label: t("runs", formatDateShort(market.dates.start), formatDateShort(market.dates.end)) };
    }
    const todayHours = hoursForToday(market);
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
    const res = await fetch("data/markets-index.json");
    const data = await res.json();
    markets = data.markets;
  }

  async function loadVendors(market) {
    if (vendorCache.has(market.id)) return vendorCache.get(market.id);
    const res = await fetch(`data/${market.vendorFile}`);
    const data = await res.json();
    vendorCache.set(market.id, data);
    return data;
  }

  function visibleMarkets() {
    const favs = getFavorites();
    return savedOnly ? markets.filter((m) => favs.has(m.id)) : markets;
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
  }

  function markerIcon(isFav) {
    return L.divIcon({
      className: "",
      html: `<div class="market-marker${isFav ? " market-marker--fav" : ""}"></div>`,
      iconSize: [16, 16],
    });
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
                  <p class="market-card__name">${market.name}</p>
                  <p class="market-card__district">${PINE_ICON}${market.district}</p>
                </div>
                <span class="fav-btn" data-fav-id="${market.id}" aria-pressed="${isFav}">${isFav ? "♥" : "♡"}</span>
              </div>
              <p class="market-card__status ${status.open ? "market-card__status--open" : "market-card__status--closed"}">${status.label}</p>
              <p class="market-card__summary">${market.summary}</p>
            </div>
          </div>
        </button>`;
      })
      .join("");

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
    currentSheetMarket = market;
    const overlay = document.getElementById("sheet-overlay");
    const status = marketStatus(market);
    const favs = getFavorites();
    const isFav = favs.has(market.id);

    document.getElementById("sheet-title").textContent = market.name;
    document.getElementById("sheet-meta").innerHTML =
      `${PINE_ICON}${market.district} · <span class="sheet__status ${status.open ? "sheet__status--open" : "sheet__status--closed"}">${status.label}</span>`;

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

    document.getElementById("sheet-calendar-btn").href = calendarUrl(market);

    const shareBtn = document.getElementById("sheet-share-btn");
    shareBtn.onclick = () => shareMarket(market, shareBtn);

    if (updateHistory) history.pushState(null, "", `#${market.id}`);

    const body = document.getElementById("sheet-body");
    body.innerHTML = `
      <p class="sheet__summary">${market.summary}</p>
      <div class="sheet__loading">${t("loadingVendors")}</div>
    `;

    overlay.hidden = false;

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
        <p class="sheet__summary">${market.summary}</p>
        ${vendorsHtml}
        <p class="sheet__last-checked">${t("lastChecked", relativeTime(vendorData.lastChecked))}</p>
      `;
    } catch {
      body.innerHTML = `
        <p class="sheet__summary">${market.summary}</p>
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
      text: market.name,
      dates: `${start}/${end}`,
      details: market.summary,
      location: market.address || `${market.district}, Berlin`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function shareMarket(market, btn) {
    const url = `${location.origin}${location.pathname}#${market.id}`;
    if (navigator.share) {
      navigator.share({ title: market.name, text: market.summary, url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url).then(() => {
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1500);
    });
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
    document.querySelectorAll(".view-switch__btn").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.view === view));
    });
    if (view === "map") {
      renderMarkers();
      setTimeout(() => map && map.invalidateSize(), 0);
    } else {
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
    initMap();
    renderList();

    document.querySelectorAll(".view-switch__btn").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    const savedToggle = document.getElementById("saved-toggle");
    savedToggle.addEventListener("click", () => {
      savedOnly = !savedOnly;
      savedToggle.setAttribute("aria-pressed", String(savedOnly));
      refreshCurrentView();
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
      document.querySelector('meta[name="theme-color"]').setAttribute(
        "content",
        next === "dark" ? "#10182D" : "#FBF8F1"
      );
    });

    document.getElementById("lang-toggle").addEventListener("click", () => {
      lang = lang === "de" ? "en" : "de";
      localStorage.setItem(LANG_KEY, lang);
      applyStaticStrings();
      refreshCurrentView();
      if (currentSheetMarket) openSheet(currentSheetMarket, { updateHistory: false });
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

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
