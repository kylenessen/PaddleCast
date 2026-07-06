import { BEAUFORT } from "../core/beaufort.js";
import { CONDITION_CATEGORIES } from "../core/wmo.js";
import { mergePrefs } from "../core/prefs.js";
import { directionWheel } from "./wheel.js";
import { saveLocation, deleteLocation } from "../storage.js";

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

function numberInput(value, { min, max, step = 1 } = {}) {
  const input = el("input");
  input.type = "number";
  input.value = value;
  if (min != null) input.min = min;
  if (max != null) input.max = max;
  input.step = step;
  return input;
}

function beaufortSelect(value) {
  const select = el("select");
  for (const b of BEAUFORT) {
    const opt = el("option", null, `${b.level} — ${b.name}`);
    opt.value = b.level;
    if (b.level === value) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

function toleranceSelect(value) {
  const select = el("select");
  for (const [v, label] of [
    ["good", "Good"],
    ["marginal", "Tolerable"],
    ["bad", "Not for me"],
  ]) {
    const opt = el("option", null, label);
    opt.value = v;
    if (v === value) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

function section(title, hint) {
  const s = el("section", "settings-section");
  s.appendChild(el("h3", null, title));
  if (hint) s.appendChild(el("p", "hint", hint));
  return s;
}

// Settings form for a location. `location` may be freshly created (from
// the add-location map) or existing. Calls onSaved(location) after save.
export function renderSettings(location, { onSaved, onDeleted }) {
  const prefs = mergePrefs(location.prefs);
  const root = el("div", "settings-view");
  root.appendChild(el("h1", "loc-title", `${location.name} — Settings`));

  const form = el("form", "settings-form");

  // Basics
  const basics = section("Location");
  const nameInput = el("input");
  nameInput.type = "text";
  nameInput.value = location.name;
  nameInput.required = true;
  const latInput = numberInput(location.lat, { step: "any" });
  const lonInput = numberInput(location.lon, { step: "any" });
  basics.appendChild(field("Name", nameInput));
  const coordRow = el("div", "field-row");
  coordRow.appendChild(field("Latitude", latInput));
  coordRow.appendChild(field("Longitude", lonInput));
  basics.appendChild(coordRow);
  form.appendChild(basics);

  // Wind
  const wind = section(
    "Wind",
    "Beaufort levels at or below the good level show as good, up to your max as marginal, above as red. Mark terrain-protected directions on the wheel to allow a higher max from those headings."
  );
  const windGood = beaufortSelect(prefs.wind.goodMax);
  const windMax = beaufortSelect(prefs.wind.max);
  const windProtMax = beaufortSelect(prefs.wind.protectedMax);
  const windRow = el("div", "field-row");
  windRow.appendChild(field("Good up to", windGood));
  windRow.appendChild(field("Max tolerated", windMax));
  wind.appendChild(windRow);
  const windWheel = directionWheel(prefs.wind.protectedSectors);
  wind.appendChild(windWheel);
  wind.appendChild(field("Max from protected directions", windProtMax));
  form.appendChild(wind);

  // Temperature
  const temp = section(
    "Temperature (°F)",
    "Min and max are the red boundaries. The sweet spot range shows as good, in between as marginal."
  );
  const tMin = numberInput(prefs.temp.min);
  const tSweetMin = numberInput(prefs.temp.sweetMin);
  const tSweetMax = numberInput(prefs.temp.sweetMax);
  const tMax = numberInput(prefs.temp.max);
  const tempRow = el("div", "field-row");
  tempRow.appendChild(field("Min", tMin));
  tempRow.appendChild(field("Sweet spot low", tSweetMin));
  tempRow.appendChild(field("Sweet spot high", tSweetMax));
  tempRow.appendChild(field("Max", tMax));
  temp.appendChild(tempRow);
  form.appendChild(temp);

  // Conditions
  const cond = section("Sky conditions", "How you rate each condition type.");
  const condSelects = {};
  const condGrid = el("div", "cond-grid");
  for (const cat of CONDITION_CATEGORIES) {
    const select = toleranceSelect(prefs.conditions[cat.id] ?? "marginal");
    condSelects[cat.id] = select;
    condGrid.appendChild(field(cat.label, select));
  }
  cond.appendChild(condGrid);
  form.appendChild(cond);

  // Tide
  const tide = section(
    "Tide",
    "Needs a NOAA tide station ID (find one at tidesandcurrents.noaa.gov). Heights are feet above MLLW."
  );
  const tideEnabled = el("input");
  tideEnabled.type = "checkbox";
  tideEnabled.checked = prefs.tide.enabled;
  const tideStation = el("input");
  tideStation.type = "text";
  tideStation.value = prefs.tide.stationId;
  tideStation.placeholder = "e.g. 9412110";
  const tideMin = numberInput(prefs.tide.minFt, { step: 0.1 });
  const tideMargin = numberInput(prefs.tide.marginFt, { step: 0.1 });
  tide.appendChild(field("Track tide at this location", tideEnabled));
  const tideRow = el("div", "field-row");
  tideRow.appendChild(field("NOAA station ID", tideStation));
  tideRow.appendChild(field("Minimum tide (ft)", tideMin));
  tideRow.appendChild(field("Marginal buffer (ft)", tideMargin));
  tide.appendChild(tideRow);
  form.appendChild(tide);

  // Waves
  const waves = section(
    "Waves",
    "For open-coast launches. Total wave height, swell and wind waves combined. Same idea as wind: protected directions allow bigger waves."
  );
  const wavesEnabled = el("input");
  wavesEnabled.type = "checkbox";
  wavesEnabled.checked = prefs.waves.enabled;
  const wavesGood = numberInput(prefs.waves.goodMaxFt, { step: 0.5 });
  const wavesMax = numberInput(prefs.waves.maxFt, { step: 0.5 });
  const wavesPeriod = numberInput(prefs.waves.minPeriodS, { step: 1 });
  const wavesProtMax = numberInput(prefs.waves.protectedMaxFt, { step: 0.5 });
  waves.appendChild(field("Track waves at this location", wavesEnabled));
  const wavesRow = el("div", "field-row");
  wavesRow.appendChild(field("Good up to (ft)", wavesGood));
  wavesRow.appendChild(field("Max tolerated (ft)", wavesMax));
  wavesRow.appendChild(field("Min period (s)", wavesPeriod));
  waves.appendChild(wavesRow);
  const wavesWheel = directionWheel(prefs.waves.protectedSectors);
  waves.appendChild(wavesWheel);
  waves.appendChild(field("Max from protected directions (ft)", wavesProtMax));
  form.appendChild(waves);

  // Actions
  const actions = el("div", "settings-actions");
  const saveBtn = el("button", "btn btn-primary", "Save");
  saveBtn.type = "submit";
  const deleteBtn = el("button", "btn btn-danger", "Delete location");
  deleteBtn.type = "button";
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);
  form.appendChild(actions);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const updated = {
      ...location,
      name: nameInput.value.trim() || location.name,
      lat: parseFloat(latInput.value),
      lon: parseFloat(lonInput.value),
      prefs: {
        wind: {
          goodMax: Number(windGood.value),
          max: Number(windMax.value),
          protectedSectors: windWheel.getSelected(),
          protectedMax: Number(windProtMax.value),
        },
        temp: {
          min: Number(tMin.value),
          max: Number(tMax.value),
          sweetMin: Number(tSweetMin.value),
          sweetMax: Number(tSweetMax.value),
        },
        conditions: Object.fromEntries(
          Object.entries(condSelects).map(([id, s]) => [id, s.value])
        ),
        tide: {
          enabled: tideEnabled.checked,
          stationId: tideStation.value.trim(),
          minFt: Number(tideMin.value),
          marginFt: Number(tideMargin.value),
        },
        waves: {
          enabled: wavesEnabled.checked,
          goodMaxFt: Number(wavesGood.value),
          maxFt: Number(wavesMax.value),
          minPeriodS: Number(wavesPeriod.value),
          protectedSectors: wavesWheel.getSelected(),
          protectedMaxFt: Number(wavesProtMax.value),
        },
      },
    };
    saveLocation(updated);
    onSaved(updated);
  });

  deleteBtn.addEventListener("click", () => {
    if (confirm(`Delete ${location.name}?`)) {
      deleteLocation(location.id);
      onDeleted();
    }
  });

  root.appendChild(form);
  return root;
}
