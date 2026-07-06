// Maintainer editor for config.json. Loads the shipped config, exposes
// the default filters and locations as a form, and produces the updated
// JSON to copy or download. It never writes anything itself; the commit
// is the save button.

import { BEAUFORT } from "./core/beaufort.js";
import { CONDITION_CATEGORIES } from "./core/wmo.js";

const editor = document.getElementById("editor");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(labelText, input) {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "field-label", labelText));
  wrap.appendChild(input);
  return wrap;
}

function section(title, hint) {
  const s = el("section", "settings-section");
  s.appendChild(el("h3", null, title));
  if (hint) s.appendChild(el("p", "hint", hint));
  return s;
}

// Reads obj[key] into an input and writes changes back, then refreshes
// the JSON preview. kind: "number", "text", or "select".
function bind(input, obj, key, kind = "number") {
  input.value = obj[key];
  input.addEventListener("input", () => {
    if (kind === "number") {
      const n = Number(input.value);
      if (Number.isFinite(n)) obj[key] = n;
    } else {
      obj[key] = input.value;
    }
    refresh();
  });
  return input;
}

function numberInput(obj, key, step = 1) {
  const input = el("input");
  input.type = "number";
  input.step = step;
  return bind(input, obj, key, "number");
}

function beaufortSelect(obj, key) {
  const select = el("select");
  for (const b of BEAUFORT) {
    const opt = el("option", null, `${b.level} — ${b.name}`);
    opt.value = b.level;
    select.appendChild(opt);
  }
  return bind(select, obj, key, "number");
}

function toleranceSelect(obj, key) {
  const select = el("select");
  for (const [v, label] of [
    ["good", "Good"],
    ["marginal", "Tolerable"],
    ["bad", "Not for me"],
  ]) {
    select.appendChild(Object.assign(el("option", null, label), { value: v }));
  }
  return bind(select, obj, key, "select");
}

// ---- defaults form ----

function renderDefaults(defaults) {
  const holder = el("div");

  const wind = section(
    "Wind (Beaufort)",
    "At or below good shows green, up to max shows yellow, above is red."
  );
  const windRow = el("div", "field-row");
  windRow.appendChild(field("Good up to", beaufortSelect(defaults.wind, "goodMax")));
  windRow.appendChild(field("Max tolerated", beaufortSelect(defaults.wind, "max")));
  windRow.appendChild(
    field("Max from protected directions", beaufortSelect(defaults.wind, "protectedMax"))
  );
  wind.appendChild(windRow);
  holder.appendChild(wind);

  const temp = section("Temperature (°F)");
  const tempRow = el("div", "field-row");
  tempRow.appendChild(field("Min", numberInput(defaults.temp, "min")));
  tempRow.appendChild(field("Sweet spot low", numberInput(defaults.temp, "sweetMin")));
  tempRow.appendChild(field("Sweet spot high", numberInput(defaults.temp, "sweetMax")));
  tempRow.appendChild(field("Max", numberInput(defaults.temp, "max")));
  temp.appendChild(tempRow);
  holder.appendChild(temp);

  const cond = section("Sky conditions");
  const grid = el("div", "cond-grid");
  for (const cat of CONDITION_CATEGORIES) {
    grid.appendChild(field(cat.label, toleranceSelect(defaults.conditions, cat.id)));
  }
  cond.appendChild(grid);
  holder.appendChild(cond);

  const tide = section("Tide (ft MLLW)", "Applied where a location enables tide.");
  const tideRow = el("div", "field-row");
  tideRow.appendChild(field("Minimum tide", numberInput(defaults.tide, "minFt", 0.1)));
  tideRow.appendChild(field("Marginal buffer", numberInput(defaults.tide, "marginFt", 0.1)));
  tide.appendChild(tideRow);
  holder.appendChild(tide);

  const waves = section(
    "Waves (ft)",
    "Total wave height, swell and wind waves combined. Applied where a location enables waves."
  );
  const wavesRow = el("div", "field-row");
  wavesRow.appendChild(field("Good up to", numberInput(defaults.waves, "goodMaxFt", 0.5)));
  wavesRow.appendChild(field("Max tolerated", numberInput(defaults.waves, "maxFt", 0.5)));
  wavesRow.appendChild(field("Min period (s)", numberInput(defaults.waves, "minPeriodS")));
  wavesRow.appendChild(
    field("Max from protected directions", numberInput(defaults.waves, "protectedMaxFt", 0.5))
  );
  waves.appendChild(wavesRow);
  holder.appendChild(waves);

  return holder;
}

// ---- locations ----

function renderLocations(config) {
  const holder = el("div");
  const head = section(
    "Locations",
    "Order here is sidebar order. Ids are stable slugs used in shared links, so avoid renaming them. " +
      "Per-location prefs are partial overrides of the defaults above, as JSON " +
      '(e.g. {"tide": {"enabled": true, "stationId": "9412110"}} or {"waves": {"enabled": true}}).'
  );
  const list = el("div");
  head.appendChild(list);

  function renderList() {
    list.textContent = "";
    config.locations.forEach((loc, i) => {
      list.appendChild(locationCard(config, loc, i, renderList));
    });
  }
  renderList();

  const add = el("button", "btn", "+ Add location");
  add.type = "button";
  add.addEventListener("click", () => {
    config.locations.push({ id: "", name: "", lat: 0, lon: 0, prefs: {} });
    renderList();
    refresh();
  });
  head.appendChild(add);
  holder.appendChild(head);
  return holder;
}

function locationCard(config, loc, index, rerenderList) {
  const card = el("div", "settings-section");

  const headRow = el("div", "loc-card-head");
  headRow.appendChild(el("h4", null, loc.name || "(unnamed)"));
  const up = el("button", "btn btn-small", "↑");
  const down = el("button", "btn btn-small", "↓");
  const remove = el("button", "btn btn-danger btn-small", "Remove");
  for (const b of [up, down, remove]) b.type = "button";
  up.disabled = index === 0;
  down.disabled = index === config.locations.length - 1;
  up.addEventListener("click", () => {
    config.locations.splice(index - 1, 0, config.locations.splice(index, 1)[0]);
    rerenderList();
    refresh();
  });
  down.addEventListener("click", () => {
    config.locations.splice(index + 1, 0, config.locations.splice(index, 1)[0]);
    rerenderList();
    refresh();
  });
  remove.addEventListener("click", () => {
    config.locations.splice(index, 1);
    rerenderList();
    refresh();
  });
  headRow.append(up, down, remove);
  card.appendChild(headRow);

  const row1 = el("div", "field-row");
  const nameInput = bind(el("input"), loc, "name", "text");
  nameInput.type = "text";
  nameInput.addEventListener("input", () => {
    headRow.querySelector("h4").textContent = loc.name || "(unnamed)";
  });
  const idInput = bind(el("input"), loc, "id", "text");
  idInput.type = "text";
  row1.appendChild(field("Name", nameInput));
  row1.appendChild(field("Id (slug)", idInput));
  card.appendChild(row1);

  const row2 = el("div", "field-row");
  row2.appendChild(field("Latitude", numberInput(loc, "lat", "any")));
  row2.appendChild(field("Longitude", numberInput(loc, "lon", "any")));
  card.appendChild(row2);

  const prefsArea = el("textarea", "prefs-json");
  prefsArea.value = JSON.stringify(loc.prefs ?? {}, null, 2);
  const error = el("p", "json-error", "");
  prefsArea.addEventListener("input", () => {
    try {
      loc.prefs = JSON.parse(prefsArea.value);
      prefsArea.classList.remove("invalid");
      error.textContent = "";
      refresh();
    } catch (err) {
      prefsArea.classList.add("invalid");
      error.textContent = `Not valid JSON, keeping the last good value. ${err.message}`;
    }
  });
  card.appendChild(field("Prefs overrides (JSON)", prefsArea));
  card.appendChild(error);
  return card;
}

// ---- output pane ----

let config;
let output;

function configJson() {
  return JSON.stringify(config, null, 2) + "\n";
}

function refresh() {
  if (output) output.value = configJson();
}

function renderOutput() {
  const pane = el("div", "editor-output");
  pane.appendChild(el("h3", null, "config.json"));

  const actions = el("div", "editor-actions");
  const download = el("button", "btn btn-primary", "Download config.json");
  download.type = "button";
  download.addEventListener("click", () => {
    const blob = new Blob([configJson()], { type: "application/json" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const copy = el("button", "btn", "Copy");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(configJson());
    copy.textContent = "Copied ✓";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });
  actions.append(download, copy);
  pane.appendChild(actions);

  output = el("textarea");
  output.readOnly = true;
  output.value = configJson();
  pane.appendChild(output);
  pane.appendChild(
    el("p", "ok-note", "Replace public/config.json with this, then commit to main.")
  );
  return pane;
}

// ---- boot ----

async function boot() {
  const res = await fetch("config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json failed to load (${res.status})`);
  config = await res.json();
  config.defaults ??= {};
  config.locations ??= [];
  // The form binds straight into these objects, so make sure every
  // section exists even if the file omitted it.
  const shape = {
    wind: { goodMax: 1, max: 3, protectedSectors: [], protectedMax: 4 },
    temp: { min: 55, max: 85, sweetMin: 62, sweetMax: 78 },
    conditions: {
      sunny: "good", partly: "good", overcast: "marginal", fog: "marginal",
      drizzle: "bad", rain: "bad", storm: "bad",
    },
    tide: { enabled: false, stationId: "", minFt: 2.5, marginFt: 0.5 },
    waves: {
      enabled: false, goodMaxFt: 2, maxFt: 4, minPeriodS: 8,
      protectedSectors: [], protectedMaxFt: 6,
    },
  };
  for (const [key, defaults] of Object.entries(shape)) {
    config.defaults[key] = { ...defaults, ...config.defaults[key] };
  }

  editor.textContent = "";
  const form = el("div", "editor-form");
  form.appendChild(renderDefaults(config.defaults));
  form.appendChild(renderLocations(config));
  editor.appendChild(form);
  editor.appendChild(renderOutput());
}

boot().catch((err) => {
  editor.textContent = "";
  editor.appendChild(el("p", "warning", `⚠ ${err.message}`));
});
