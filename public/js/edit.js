// Maintainer editor for config.json. Loads the shipped config, lets you
// manage locations on a map with the same preference controls the app
// uses, edit the global default filters, and save straight back to
// public/config.json through the local editor server (tools/edit-server.mjs).
//
// Save posts to /__save-config, which only exists when the site is
// served by that editor server. Under a plain static server or the
// deployed site there is nothing to write to, and Save reports that.

import { buildPrefsForm, field, numberInput } from "./ui/prefsform.js";
import { SCHEMES } from "./core/colors.js";
import { CATEGORY_LABELS } from "./core/evaluate.js";

const editor = document.getElementById("editor");

// Full-prefs fallback shape, so a config.json that omits a section (or a
// key) still gives every control something to bind to.
const SHAPE = {
  wind: {
    excellentMax: 0, acceptableMax: 1, marginalMax: 2,
    protectedSectors: [], protectedMax: 3,
  },
  temp: {
    excellentMin: 65, excellentMax: 75,
    acceptableMin: 60, acceptableMax: 80,
    marginalMin: 55, marginalMax: 85,
  },
  conditions: {
    sunny: "excellent", partly: "acceptable",
    overcast: "marginal", fog: "marginal",
    drizzle: "notForMe", rain: "notForMe", storm: "notForMe",
  },
  tide: { enabled: false, stationId: "", minFt: 2.5, marginFt: 0.5 },
  waves: {
    enabled: false, excellentMaxFt: 2, acceptableMaxFt: 3, marginalMaxFt: 4,
    periodRatio: 2,
  },
};

let config;
let map;
let defaultsForm;
const colorInputs = {}; // scheme id -> [input x4], anchor order
const handles = []; // { loc, marker, coordsEl, prefsForm, card, title }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function section(title, hint) {
  const s = el("section", "settings-section");
  s.appendChild(el("h3", null, title));
  if (hint) s.appendChild(el("p", "hint", hint));
  return s;
}

function normalizeDefaults(d) {
  const out = d ?? {};
  for (const [key, base] of Object.entries(SHAPE)) {
    out[key] = { ...base, ...out[key] };
  }
  return out;
}

// Full prefs for display: a location's partial override laid over the
// current defaults, so every control shows its effective value.
function mergeOver(defaults, override) {
  const out = structuredClone(defaults);
  if (override) {
    for (const s of Object.keys(out)) {
      if (override[s] && typeof override[s] === "object") {
        out[s] = { ...out[s], ...override[s] };
      }
    }
  }
  return out;
}

// Minimal override for storage: only the keys that differ from the
// defaults, so config.json stays small and diffable and locations keep
// inheriting future default changes.
function diffFrom(defaults, full) {
  const out = {};
  for (const s of Object.keys(full)) {
    const changed = {};
    for (const k of Object.keys(full[s])) {
      if (JSON.stringify(full[s][k]) !== JSON.stringify(defaults[s]?.[k])) {
        changed[k] = full[s][k];
      }
    }
    if (Object.keys(changed).length) out[s] = changed;
  }
  return out;
}

function slugify(name) {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "spot";
}

function round5(n) {
  return Number(Number(n).toFixed(5));
}

function coordsText(loc) {
  return `${round5(loc.lat)}, ${round5(loc.lon)}`;
}

// ---- global defaults ----

function renderDefaults() {
  const details = el("details", "defaults-toggle");
  details.open = true;
  details.appendChild(el("summary", null, "Global default filters"));
  const hint = el(
    "p", "hint",
    "The starting thresholds for every spot. A location only stores the values it overrides, so changing a default here updates everywhere that hasn't been customized."
  );
  details.appendChild(hint);
  defaultsForm = buildPrefsForm(config.defaults);
  details.appendChild(defaultsForm.element);
  return details;
}

// ---- hour colors ----

// The four ramp anchors per scheme (excellent, acceptable, marginal,
// notForMe). Values live in config.json's "colors" key; the built-in
// scheme anchors fill in when the key is absent.
function renderColors() {
  const holder = section(
    "Hour colors",
    "Four anchor colors per scheme, one per category. An hour's color blends between adjacent anchors by its score, so these set the whole ramp."
  );
  const categoryNames = Object.values(CATEGORY_LABELS);
  for (const [id, scheme] of Object.entries(SCHEMES)) {
    const stored = config.colors?.[id];
    const anchors =
      Array.isArray(stored) && stored.length === 4 ? stored : scheme.anchors;
    holder.appendChild(el("h4", "color-scheme-title", scheme.label));
    const row = el("div", "field-row");
    colorInputs[id] = anchors.map((hex, i) => {
      const input = el("input");
      input.type = "color";
      input.value = hex;
      row.appendChild(field(categoryNames[i], input));
      return input;
    });
    holder.appendChild(row);
  }
  return holder;
}

// ---- locations ----

function addLocationRow(loc, listEl) {
  const marker = L.marker([loc.lat, loc.lon], { draggable: true });
  if (loc.name) marker.bindTooltip(loc.name, { permanent: false });
  marker.addTo(map);

  const card = el("div", "loc-card");
  const head = el("div", "loc-card-head");
  const title = el("h3", null, loc.name || "(unnamed)");
  head.appendChild(title);
  const locateBtn = el("button", "btn btn-small", "Show on map");
  locateBtn.type = "button";
  const delBtn = el("button", "btn btn-danger btn-small", "Delete");
  delBtn.type = "button";
  head.append(locateBtn, delBtn);
  card.appendChild(head);

  const nameRow = el("div", "field-row");
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = loc.name;
  const idInput = el("input");
  idInput.type = "text";
  idInput.value = loc.id;
  let idEdited = Boolean(loc.id);
  idInput.addEventListener("input", () => {
    idEdited = true;
    loc.id = idInput.value;
  });
  nameInput.addEventListener("input", () => {
    loc.name = nameInput.value;
    title.textContent = loc.name || "(unnamed)";
    marker.unbindTooltip();
    if (loc.name) marker.bindTooltip(loc.name);
    // Keep the slug tracking the name until the id is edited directly.
    if (!idEdited) {
      loc.id = slugify(loc.name);
      idInput.value = loc.id;
    }
  });
  nameRow.append(field("Name", nameInput), field("Id (slug)", idInput));
  card.appendChild(nameRow);

  const coordsEl = el("p", "loc-coords", coordsText(loc));
  card.appendChild(coordsEl);

  const details = el("details", "loc-prefs");
  details.appendChild(el("summary", null, "Filters for this spot"));
  const prefsForm = buildPrefsForm(mergeOver(config.defaults, loc.prefs));
  details.appendChild(prefsForm.element);
  card.appendChild(details);

  const handle = { loc, marker, coordsEl, prefsForm, card, title };
  handles.push(handle);
  listEl.appendChild(card);

  marker.on("drag", () => {
    const p = marker.getLatLng();
    loc.lat = p.lat;
    loc.lon = p.lng;
    coordsEl.textContent = coordsText(loc);
  });
  locateBtn.addEventListener("click", () => {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 12));
    marker.openTooltip();
    card.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  delBtn.addEventListener("click", () => {
    if (!confirm(`Delete ${loc.name || "this location"}?`)) return;
    map.removeLayer(marker);
    card.remove();
    handles.splice(handles.indexOf(handle), 1);
  });

  return handle;
}

function renderLocations() {
  const holder = section(
    "Locations",
    "Drag a marker to move a launch, or click an empty spot on the map to add one. Order here is the row order on the site's home table. Ids are stable slugs used in shared links, so avoid changing an existing one."
  );

  const listEl = el("div");
  const addBtn = el("button", "btn", "+ Add location at map center");
  addBtn.type = "button";
  addBtn.addEventListener("click", () => {
    const c = map.getCenter();
    const loc = { id: "", name: "", lat: round5(c.lat), lon: round5(c.lng), prefs: {} };
    const handle = addLocationRow(loc, listEl);
    handle.card.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  holder.appendChild(listEl);
  holder.appendChild(addBtn);
  return { holder, listEl };
}

// ---- save bar ----

function renderSaveBar() {
  const bar = el("div", "save-bar");
  const saveBtn = el("button", "btn btn-primary", "Save to config.json");
  saveBtn.type = "button";
  const status = el("span", "save-status");
  bar.append(saveBtn, status);

  saveBtn.addEventListener("click", async () => {
    status.className = "save-status";
    const error = validateAndCollect();
    if (error) {
      status.classList.add("err");
      status.textContent = `⚠ ${error}`;
      return;
    }
    saveBtn.disabled = true;
    status.textContent = "Saving…";
    try {
      const res = await fetch("/__save-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        status.classList.add("ok");
        status.textContent = "✓ Saved to public/config.json. Commit and push to deploy.";
      } else {
        status.classList.add("err");
        status.textContent = `⚠ Save failed: ${await res.text()}`;
      }
    } catch {
      status.classList.add("err");
      status.textContent =
        "⚠ No editor server. Run: node tools/edit-server.mjs, then open it there.";
    } finally {
      saveBtn.disabled = false;
    }
  });

  return bar;
}

// Reads every form into `config`, returning an error string or null.
function validateAndCollect() {
  config.defaults = defaultsForm.read();
  config.colors = Object.fromEntries(
    Object.entries(colorInputs).map(([id, inputs]) => [
      id,
      inputs.map((input) => input.value.toUpperCase()),
    ])
  );
  const locations = [];
  const seen = new Set();
  for (const h of handles) {
    const id = (h.loc.id || "").trim();
    const name = (h.loc.name || "").trim();
    if (!name) return "Every location needs a name.";
    if (!id) return `"${name}" needs an id.`;
    if (!/^[a-z0-9-]+$/.test(id)) {
      return `Id "${id}" must be lowercase letters, numbers, and hyphens.`;
    }
    if (seen.has(id)) return `Duplicate id "${id}". Ids must be unique.`;
    seen.add(id);
    locations.push({
      id,
      name,
      lat: round5(h.loc.lat),
      lon: round5(h.loc.lon),
      prefs: diffFrom(config.defaults, h.prefsForm.read()),
    });
  }
  config.locations = locations;
  return null;
}

// ---- boot ----

async function boot() {
  const res = await fetch("config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json failed to load (${res.status})`);
  config = await res.json();
  config.defaults = normalizeDefaults(config.defaults);
  config.locations = Array.isArray(config.locations) ? config.locations : [];

  editor.textContent = "";

  const mapDiv = el("div", "edit-map");
  editor.appendChild(mapDiv);
  editor.appendChild(renderDefaults());
  editor.appendChild(renderColors());
  const { holder, listEl } = renderLocations();
  editor.appendChild(holder);
  document.body.appendChild(renderSaveBar());

  map = L.map(mapDiv);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  for (const loc of config.locations) addLocationRow(loc, listEl);

  // Frame the markers once the container has its real size. Fitting
  // before layout settles makes Leaflet zoom to the whole world.
  const fit = () => {
    map.invalidateSize();
    if (handles.length) {
      const group = L.featureGroup(handles.map((h) => h.marker));
      map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 13 });
    } else {
      map.setView([35.34, -120.83], 10);
    }
  };
  map.setView([35.34, -120.83], 10);
  requestAnimationFrame(fit);
}

boot().catch((err) => {
  editor.textContent = "";
  editor.appendChild(el("p", "warning", `⚠ ${err.message}`));
});
