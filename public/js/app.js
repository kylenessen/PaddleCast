import { loadConfig, getConfigVersion } from "./config.js";
import { buildForecast } from "./core/forecast.js";
import { SCHEMES, schemeAnchors } from "./core/colors.js";
import {
  getLocations, getLocation, saveLocation, newLocationId,
  getSettings, setSettings, getGlobalPrefs, setGlobalPrefs,
} from "./storage.js";
import { mergePrefs } from "./core/prefs.js";
import { buildPrefsForm } from "./ui/prefsform.js";
import { renderDayView, renderWeekTable } from "./ui/views.js";
import { renderSettings } from "./ui/settings.js";

const main = document.getElementById("main");

// Forecasts fetched on this page load, keyed by location id. The whole
// app is on-demand: reload the page to refresh data.
const forecastCache = new Map();

async function forecastFor(location) {
  if (!forecastCache.has(location.id)) {
    forecastCache.set(
      location.id,
      buildForecast(location, { globalPrefs: getGlobalPrefs() }).catch(
        (err) => err
      )
    );
  }
  return forecastCache.get(location.id);
}

function invalidate(id) {
  forecastCache.delete(id);
}

function invalidateAll() {
  forecastCache.clear();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---- chrome ----

// There is no menu bar. The home page is the navigation: the week
// table's rows link to each location. Every other page gets a small
// floating corner nav with a house back to the table and, when the
// page has its own settings, a cog.

const ICONS = {
  home:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  cog:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
};

function navIcon(name, href, label) {
  const a = el("a", "nav-icon");
  a.href = href;
  a.title = label;
  a.setAttribute("aria-label", label);
  a.innerHTML = ICONS[name];
  return a;
}

function topNav(settingsHref) {
  const nav = el("nav", "top-nav");
  nav.appendChild(navIcon("home", "#/", "Home"));
  if (settingsHref) nav.appendChild(navIcon("cog", settingsHref, "Settings"));
  return nav;
}

// ---- views ----

function setMain(node, nav) {
  main.textContent = "";
  if (nav) main.appendChild(nav);
  main.appendChild(node);
}

function loadingView(text) {
  return el("div", "loading", text);
}

async function showHome() {
  const locations = getLocations();
  if (locations.length === 0) {
    const empty = el("div", "empty-state");
    empty.appendChild(el("h1", null, "PaddleCast"));
    empty.appendChild(
      el("p", null, "Forecasts for the places you paddle, judged by your own thresholds.")
    );
    empty.appendChild(
      el("p", null, "No locations are available right now. Try reloading.")
    );
    setMain(empty);
    return;
  }

  const page = el("div", "home");
  const header = el("header", "home-header");
  header.appendChild(el("h1", "brand-title", "PaddleCast"));
  page.appendChild(header);

  const holder = el("div");
  holder.appendChild(loadingView("Loading forecasts…"));
  page.appendChild(holder);

  const actions = el("div", "home-actions");
  const gear = el("a", "btn btn-icon");
  gear.href = "#/settings";
  gear.innerHTML = ICONS.cog;
  gear.appendChild(el("span", null, "Settings"));
  actions.appendChild(gear);
  page.appendChild(actions);

  const footer = el("footer", "site-footer");
  const credit = el("p");
  const me = el("a", null, "Kyle Nessen");
  me.href = "https://kylenessen.com";
  me.target = "_blank";
  me.rel = "noopener";
  const lab = el("a", null, "Baywood Labs");
  lab.href = "https://www.baywood-labs.com";
  lab.target = "_blank";
  lab.rel = "noopener";
  credit.append(
    "PaddleCast is a community project made by ",
    me,
    " at ",
    lab,
    "."
  );
  footer.appendChild(credit);
  page.appendChild(footer);
  setMain(page);

  const entries = await Promise.all(
    locations.map(async (loc) => ({
      location: loc,
      forecast: await forecastFor(loc),
    }))
  );
  holder.textContent = "";
  holder.appendChild(renderWeekTable(entries));
}

// Day links carry the calendar date (#/loc/baywood?day=2026-07-10), not
// an index, so a shared link opens the same day for whoever clicks it.
// A date that has already passed out of the forecast falls back to the
// first day. Bare numeric indexes still work for old links.
function dayLink(id, forecast, i) {
  return `#/loc/${id}?day=${forecast.days[i]?.date ?? i}`;
}

function dayIndexFor(forecast, dayParam) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayParam)) {
    const i = forecast.days.findIndex((d) => d.date === dayParam);
    return i >= 0 ? i : 0;
  }
  const n = Number(dayParam) || 0;
  return Math.min(Math.max(n, 0), forecast.days.length - 1);
}

async function showLocation(id, dayParam) {
  const loc = getLocation(id);
  if (!loc) {
    location.hash = "#/";
    return;
  }
  setMain(loadingView(`Fetching conditions for ${loc.name}…`), topNav());
  const forecast = await forecastFor(loc);
  if (forecast instanceof Error) {
    const errBox = el("div", "empty-state");
    errBox.appendChild(el("h1", null, loc.name));
    errBox.appendChild(el("p", "warning", `⚠ ${forecast.message}`));
    setMain(errBox, topNav());
    return;
  }
  const i = dayIndexFor(forecast, dayParam);
  const view = renderDayView(forecast, i, {
    onPickDay: (n) => {
      location.hash = dayLink(id, forecast, n);
    },
  });
  // The cog here is this location's own preferences, not app settings.
  setMain(view, topNav(`#/loc/${id}/settings`));
}

function showSettings(id) {
  const loc = getLocation(id);
  if (!loc) {
    location.hash = "#/";
    return;
  }
  setMain(
    renderSettings(loc, {
      onSaved: (updated) => {
        invalidate(updated.id);
        location.hash = `#/loc/${updated.id}`;
      },
    }),
    topNav()
  );
}

// ---- add location (map picker) ----

let leafletLoading;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletLoading) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    leafletLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load map library"));
      document.head.appendChild(script);
    });
  }
  return leafletLoading;
}

async function showAddLocation() {
  const page = el("div", "add-view");
  page.appendChild(el("h1", "page-title", "Add a location"));
  page.appendChild(
    el("p", "hint", "Click the map to drop a point where you launch, name it, and save.")
  );
  const mapDiv = el("div", "map");
  page.appendChild(mapDiv);

  const form = el("form", "add-form");
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.placeholder = "Name this spot (e.g. Baywood)";
  nameInput.required = true;
  const coords = el("span", "coords", "No point selected yet");
  const save = el("button", "btn btn-primary", "Save location");
  save.type = "submit";
  save.disabled = true;
  form.appendChild(nameInput);
  form.appendChild(coords);
  form.appendChild(save);
  page.appendChild(form);
  setMain(page, topNav());

  await loadLeaflet();
  const map = L.map(mapDiv).setView([35.34, -120.83], 10);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  let marker = null;
  let picked = null;
  map.on("click", (e) => {
    // 5 decimal places is about a meter, plenty for a launch spot.
    picked = {
      lat: Number(e.latlng.lat.toFixed(5)),
      lon: Number(e.latlng.lng.toFixed(5)),
    };
    coords.textContent = `${picked.lat.toFixed(4)}, ${picked.lon.toFixed(4)}`;
    if (marker) marker.setLatLng(e.latlng);
    else marker = L.marker(e.latlng).addTo(map);
    save.disabled = false;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!picked) return;
    const loc = {
      id: newLocationId(),
      name: nameInput.value.trim(),
      lat: picked.lat,
      lon: picked.lon,
      prefs: {},
    };
    saveLocation(loc);
    location.hash = `#/loc/${loc.id}/settings`;
  });
}

// ---- global settings ----

function showAppSettings() {
  const page = el("div", "settings-view");
  page.appendChild(el("h1", "page-title", "Settings"));
  const form = el("form", "settings-form");

  // Color scheme applies immediately, no save needed.
  const sec = el("section", "settings-section");
  sec.appendChild(el("h3", null, "Color scheme"));
  const current = getSettings().scheme;
  for (const [id, scheme] of Object.entries(SCHEMES)) {
    const label = el("label", "field field-inline");
    const radio = el("input");
    radio.type = "radio";
    radio.name = "scheme";
    radio.value = id;
    radio.checked = id === current;
    radio.addEventListener("change", () => setSettings({ scheme: id }));
    label.appendChild(radio);
    label.appendChild(el("span", null, scheme.label));
    const swatches = el("span", "swatches");
    for (const anchor of schemeAnchors(id)) {
      const sw = el("span", "swatch");
      sw.style.background = anchor;
      swatches.appendChild(sw);
    }
    label.appendChild(swatches);
    sec.appendChild(label);
  }
  form.appendChild(sec);

  // The visitor's own thresholds for every location at once. Saved as a
  // layer over the shipped defaults; a location's own settings page
  // still overrides these for that spot.
  const intro = el("section", "settings-section");
  intro.appendChild(el("h3", null, "Your conditions"));
  intro.appendChild(
    el(
      "p",
      "hint",
      "These thresholds apply to every location. A location's own " +
        "preferences page still overrides them for that spot."
    )
  );
  form.appendChild(intro);
  const prefsForm = buildPrefsForm(mergePrefs(getGlobalPrefs()));
  form.appendChild(prefsForm.element);

  const actions = el("div", "settings-actions");
  const saveBtn = el("button", "btn btn-primary", "Save for all locations");
  saveBtn.type = "submit";
  const resetBtn = el("button", "btn", "Reset to site defaults");
  resetBtn.type = "button";
  actions.appendChild(saveBtn);
  actions.appendChild(resetBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setGlobalPrefs(prefsForm.read());
    invalidateAll();
    location.hash = "#/";
  });
  resetBtn.addEventListener("click", () => {
    if (!confirm("Discard your saved thresholds and go back to the site defaults?")) return;
    setGlobalPrefs(null);
    invalidateAll();
    location.hash = "#/";
  });

  page.appendChild(form);
  setMain(page, topNav());
}

// ---- router ----

function route() {
  const hash = location.hash || "#/";
  const settingsMatch = hash.match(/^#\/loc\/([^/?]+)\/settings/);
  const locMatch = hash.match(/^#\/loc\/([^/?]+)(?:\?day=([\d-]+))?/);
  if (hash.startsWith("#/add")) showAddLocation();
  else if (hash.startsWith("#/settings")) showAppSettings();
  else if (settingsMatch) showSettings(settingsMatch[1]);
  else if (locMatch) showLocation(locMatch[1], locMatch[2] ?? "0");
  else showHome();
}

// ---- staleness guards ----

// The version baked into this file. config.json carries the matching
// deploy stamp and is always fetched with no-cache, so a client running
// old cached JS sees a newer number there and reloads itself once.
const APP_VERSION = 9;

function reloadIfStaleBuild() {
  const deployed = getConfigVersion();
  if (deployed <= APP_VERSION) return false;
  // One attempt per deployed version, so a client that somehow still
  // gets the old JS after reloading does not loop forever.
  const guard = "paddlecast.reloadedFor";
  if (sessionStorage.getItem(guard) === String(deployed)) return false;
  sessionStorage.setItem(guard, String(deployed));
  location.reload();
  return true;
}

// iOS Safari resurrects the page from the back-forward cache with
// day-old forecasts still on screen. Reload on restore, and when the
// tab returns to the foreground after more than an hour away.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) location.reload();
});
let hiddenAt = null;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60 * 60 * 1000) location.reload();
});

// Shipped defaults (filters and locations) come from config.json, so
// load it before the first route. On failure the app still runs with
// built-in fallbacks and whatever the visitor has saved locally.
loadConfig()
  .catch((err) => console.warn(err.message))
  .then(() => {
    if (reloadIfStaleBuild()) return;
    window.addEventListener("hashchange", route);
    route();
  });
