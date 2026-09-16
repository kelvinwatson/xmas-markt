(() => {
  "use strict";

  const FAVORITES_KEY = "cmapp_favorites";
  const THEME_KEY = "cmapp_theme";
  const BERLIN_CENTER = [52.517, 13.389];
  const PINE_ICON = `<svg width="13" height="13" viewBox="0 0 16 16"><path d="M8 15 V2 M8 4.5 L4.3 7 M8 4.5 L11.7 7 M8 8 L4.3 10.5 M8 8 L11.7 10.5 M8 2 L6.2 0.5 M8 2 L9.8 0.5" stroke="var(--pine)" stroke-width="1.3" stroke-linecap="round" fill="none"/></svg>`;

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
      return { open: false, label: `Runs ${formatDateShort(market.dates.start)} – ${formatDateShort(market.dates.end)}` };
    }
    const todayHours = hoursForToday(market);
    const { start, end } = parseRange(todayHours);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startMin = timeToMinutes(start);
    const endMin = timeToMinutes(end);
    if (nowMin >= startMin && nowMin < endMin) {
      return { open: true, label: `Open now · closes ${end}` };
    }
    return { open: false, label: `Closed · opens ${start}` };
  }

  function formatDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function relativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
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
      container.innerHTML = `<p class="empty-state">${
        savedOnly ? "No saved markets yet. Tap the heart on a market to save it." : "No markets found."
      }</p>`;
      return;
    }

    container.innerHTML = items
      .map((market) => {
        const status = marketStatus(market);
        const isFav = favs.has(market.id);
        return `
        <button class="market-card ${status.open ? "" : "market-card--closed"}" data-id="${market.id}">
          <div class="market-card__top">
            <div>
              <p class="market-card__name">${market.name}</p>
              <p class="market-card__district">${PINE_ICON}${market.district}</p>
            </div>
            <span class="fav-btn" data-fav-id="${market.id}" aria-pressed="${isFav}">${isFav ? "♥" : "♡"}</span>
          </div>
          <p class="market-card__status ${status.open ? "market-card__status--open" : "market-card__status--closed"}">${status.label}</p>
          <p class="market-card__summary">${market.summary}</p>
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
  async function openSheet(market) {
    const overlay = document.getElementById("sheet-overlay");
    const status = marketStatus(market);
    const favs = getFavorites();
    const isFav = favs.has(market.id);

    document.getElementById("sheet-title").textContent = market.name;
    document.getElementById("sheet-meta").innerHTML =
      `${PINE_ICON}${market.district} · <span class="sheet__status ${status.open ? "sheet__status--open" : "sheet__status--closed"}">${status.label}</span>`;

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

    const body = document.getElementById("sheet-body");
    body.innerHTML = `
      <p class="sheet__summary">${market.summary}</p>
      <div class="sheet__loading">Loading vendors…</div>
    `;

    overlay.hidden = false;

    try {
      const vendorData = await loadVendors(market);
      const groups = {};
      vendorData.vendors.forEach((v) => {
        (groups[v.category] ||= []).push(v);
      });

      const groupLabels = { food: "Food & drink", crafts: "Gifts & crafts", activity: "Things to do" };

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
        <p class="sheet__last-checked">Vendor list last checked ${relativeTime(vendorData.lastChecked)}</p>
      `;
    } catch {
      body.innerHTML = `
        <p class="sheet__summary">${market.summary}</p>
        <p class="sheet__error">Couldn't load vendor details right now.</p>
      `;
    }
  }

  function closeSheet() {
    document.getElementById("sheet-overlay").hidden = true;
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

    document.getElementById("theme-toggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem(THEME_KEY, next);
      document.querySelector('meta[name="theme-color"]').setAttribute(
        "content",
        next === "dark" ? "#10182D" : "#FBF8F1"
      );
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
