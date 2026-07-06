import { loadConfig } from "./config.js";
import { buildForecast } from "./core/forecast.js";
import { SCHEMES, schemeAnchors } from "./core/colors.js";
import {
  getLocations, getLocation, saveLocation, newLocationId,
  getSettings, setSettings,
} from "./storage.js";
import { renderDayView, renderLocationSummary } from "./ui/views.js";
import { renderSettings } from "./ui/settings.js";

const main = document.getElementById("main");
const locList = document.getElementById("loc-list");
const sidebar = document.getElementById("sidebar");

// Forecasts fetched on this page load, keyed by location id. The whole
// app is on-demand: reload the page to refresh data.
const forecastCache = new Map();

async function forecastFor(location) {
  if (!forecastCache.has(location.id)) {
    forecastCache.set(
      location.id,
      buildForecast(location).catch((err) => err)
    );
  }
  return forecastCache.get(location.id);
}

function invalidate(id) {
  forecastCache.delete(id);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ---- sidebar ----

function renderSidebar() {
  locList.textContent = "";
  for (const loc of getLocations()) {
    const item = el("a", "loc-item", loc.name);
    item.href = `#/loc/${loc.id}`;
    if (location.hash.startsWith(`#/loc/${loc.id}`)) {
      item.classList.add("active");
    }
    locList.appendChild(item);
  }
}

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  sidebar.classList.toggle("collapsed");
});

// On phone-width screens start collapsed so the forecast gets the room.
if (window.innerWidth < 720) sidebar.classList.add("collapsed");

// ---- views ----

function setMain(node) {
  main.textContent = "";
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
    const add = el("a", "btn btn-primary", "Add your first location");
    add.href = "#/add";
    empty.appendChild(add);
    setMain(empty);
    return;
  }

  const page = el("div", "home");
  page.appendChild(el("h1", "page-title", "This week"));
  setMain(page);

  await Promise.all(
    locations.map(async (loc) => {
      const holder = el("div");
      holder.appendChild(loadingView(`Loading ${loc.name}…`));
      page.appendChild(holder);
      const forecast = await forecastFor(loc);
      holder.textContent = "";
      holder.appendChild(
        renderLocationSummary(loc, forecast, {
          onPickDay: (i) => {
            location.hash = dayLink(loc.id, forecast, i);
          },
        })
      );
    })
  );
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
  setMain(loadingView(`Fetching conditions for ${loc.name}…`));
  const forecast = await forecastFor(loc);
  if (forecast instanceof Error) {
    const errBox = el("div", "empty-state");
    errBox.appendChild(el("h1", null, loc.name));
    errBox.appendChild(el("p", "warning", `⚠ ${forecast.message}`));
    setMain(errBox);
    return;
  }
  const i = dayIndexFor(forecast, dayParam);
  const view = renderDayView(forecast, i, {
    onPickDay: (n) => {
      location.hash = dayLink(id, forecast, n);
    },
  });
  const gear = el("a", "btn settings-link", "⚙ Preferences");
  gear.href = `#/loc/${id}/settings`;
  view.querySelector(".day-header").appendChild(gear);
  setMain(view);
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
        renderSidebar();
        location.hash = `#/loc/${updated.id}`;
      },
      onDeleted: () => {
        invalidate(id);
        renderSidebar();
        location.hash = "#/";
      },
    })
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
  setMain(page);

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
    renderSidebar();
    location.hash = `#/loc/${loc.id}/settings`;
  });
}

// ---- global settings (color scheme) ----

function showAppSettings() {
  const page = el("div", "settings-view");
  page.appendChild(el("h1", "page-title", "App settings"));
  const form = el("div", "settings-form");
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

  const maintainer = el("section", "settings-section");
  maintainer.appendChild(el("h3", null, "Site defaults"));
  const hint = el("p", "hint");
  hint.append(
    "The locations and filters everyone sees ship in config.json. Use the "
  );
  const editLink = el("a", null, "config editor");
  editLink.href = "edit.html";
  hint.appendChild(editLink);
  hint.append(" to change them, then commit the file to the repo.");
  maintainer.appendChild(hint);
  form.appendChild(maintainer);

  page.appendChild(form);
  setMain(page);
}

// ---- router ----

function route() {
  const hash = location.hash || "#/";
  renderSidebar();
  const settingsMatch = hash.match(/^#\/loc\/([^/?]+)\/settings/);
  const locMatch = hash.match(/^#\/loc\/([^/?]+)(?:\?day=([\d-]+))?/);
  if (hash.startsWith("#/add")) showAddLocation();
  else if (hash.startsWith("#/settings")) showAppSettings();
  else if (settingsMatch) showSettings(settingsMatch[1]);
  else if (locMatch) showLocation(locMatch[1], locMatch[2] ?? "0");
  else showHome();
}

// Shipped defaults (filters and locations) come from config.json, so
// load it before the first route. On failure the app still runs with
// built-in fallbacks and whatever the visitor has saved locally.
loadConfig()
  .catch((err) => console.warn(err.message))
  .then(() => {
    window.addEventListener("hashchange", route);
    route();
  });
