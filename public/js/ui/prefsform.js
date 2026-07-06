// The per-location preference controls (wind, temperature, sky, tide,
// waves), built once and reused by both the in-app location settings
// page and the maintainer config editor at /edit.html.
//
// buildPrefsForm(prefs) returns { element, read }. `element` is a
// fragment of settings sections to drop into a form; `read()` returns a
// full prefs object reflecting the current control values, including
// the protected-direction wheels for wind and waves.

import { BEAUFORT } from "../core/beaufort.js";
import { CONDITION_CATEGORIES } from "../core/wmo.js";
import { CATEGORY_LABELS } from "../core/evaluate.js";
import { directionWheel } from "./wheel.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function field(labelText, input) {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "field-label", labelText));
  wrap.appendChild(input);
  return wrap;
}

export function numberInput(value, { min, max, step = 1 } = {}) {
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

function categorySelect(value) {
  const select = el("select");
  for (const [v, label] of Object.entries(CATEGORY_LABELS)) {
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

// prefs must be a full prefs object (merge partial overrides first).
export function buildPrefsForm(prefs) {
  const frag = document.createDocumentFragment();

  // Wind
  const wind = section(
    "Wind",
    "Beaufort ceilings for each tier: at or below excellent is excellent, then acceptable, then marginal, above marginal is not for me. Mark terrain-protected directions on the wheel to allow a higher marginal ceiling from those headings."
  );
  const windExcellent = beaufortSelect(prefs.wind.excellentMax);
  const windAcceptable = beaufortSelect(prefs.wind.acceptableMax);
  const windMarginal = beaufortSelect(prefs.wind.marginalMax);
  const windProtMax = beaufortSelect(prefs.wind.protectedMax);
  const windRow = el("div", "field-row");
  windRow.appendChild(field("Excellent up to", windExcellent));
  windRow.appendChild(field("Acceptable up to", windAcceptable));
  windRow.appendChild(field("Marginal up to", windMarginal));
  wind.appendChild(windRow);
  const windWheel = directionWheel(prefs.wind.protectedSectors);
  wind.appendChild(windWheel);
  wind.appendChild(field("Marginal up to, from protected directions", windProtMax));
  frag.appendChild(wind);

  // Temperature
  const temp = section(
    "Temperature (°F)",
    "Three nested ranges: a tight excellent range inside a wider acceptable range inside the marginal range. Outside marginal is not for me."
  );
  const tExcMin = numberInput(prefs.temp.excellentMin);
  const tExcMax = numberInput(prefs.temp.excellentMax);
  const tAccMin = numberInput(prefs.temp.acceptableMin);
  const tAccMax = numberInput(prefs.temp.acceptableMax);
  const tMarMin = numberInput(prefs.temp.marginalMin);
  const tMarMax = numberInput(prefs.temp.marginalMax);
  const tempRows = [
    ["Excellent", tExcMin, tExcMax],
    ["Acceptable", tAccMin, tAccMax],
    ["Marginal", tMarMin, tMarMax],
  ];
  for (const [label, minInput, maxInput] of tempRows) {
    const row = el("div", "field-row");
    row.appendChild(field(`${label} low`, minInput));
    row.appendChild(field(`${label} high`, maxInput));
    temp.appendChild(row);
  }
  frag.appendChild(temp);

  // Conditions
  const cond = section("Sky conditions", "How you rate each condition type.");
  const condSelects = {};
  const condGrid = el("div", "cond-grid");
  for (const cat of CONDITION_CATEGORIES) {
    const select = categorySelect(prefs.conditions[cat.id] ?? "marginal");
    condSelects[cat.id] = select;
    condGrid.appendChild(field(cat.label, select));
  }
  cond.appendChild(condGrid);
  frag.appendChild(cond);

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
  frag.appendChild(tide);

  // Waves
  const waves = section(
    "Waves",
    "For open-coast launches. Total wave height, swell and wind waves combined, with nested ceilings like wind. The minimum period only applies to the excellent tier. Protected directions allow bigger waves."
  );
  const wavesEnabled = el("input");
  wavesEnabled.type = "checkbox";
  wavesEnabled.checked = prefs.waves.enabled;
  const wavesExcellent = numberInput(prefs.waves.excellentMaxFt, { step: 0.5 });
  const wavesAcceptable = numberInput(prefs.waves.acceptableMaxFt, { step: 0.5 });
  const wavesMarginal = numberInput(prefs.waves.marginalMaxFt, { step: 0.5 });
  const wavesPeriod = numberInput(prefs.waves.minPeriodS, { step: 1 });
  const wavesProtMax = numberInput(prefs.waves.protectedMaxFt, { step: 0.5 });
  waves.appendChild(field("Track waves at this location", wavesEnabled));
  const wavesRow = el("div", "field-row");
  wavesRow.appendChild(field("Excellent up to (ft)", wavesExcellent));
  wavesRow.appendChild(field("Acceptable up to (ft)", wavesAcceptable));
  wavesRow.appendChild(field("Marginal up to (ft)", wavesMarginal));
  wavesRow.appendChild(field("Min period for excellent (s)", wavesPeriod));
  waves.appendChild(wavesRow);
  const wavesWheel = directionWheel(prefs.waves.protectedSectors);
  waves.appendChild(wavesWheel);
  waves.appendChild(field("Marginal up to, from protected directions (ft)", wavesProtMax));
  frag.appendChild(waves);

  function read() {
    return {
      wind: {
        excellentMax: Number(windExcellent.value),
        acceptableMax: Number(windAcceptable.value),
        marginalMax: Number(windMarginal.value),
        protectedSectors: windWheel.getSelected(),
        protectedMax: Number(windProtMax.value),
      },
      temp: {
        excellentMin: Number(tExcMin.value),
        excellentMax: Number(tExcMax.value),
        acceptableMin: Number(tAccMin.value),
        acceptableMax: Number(tAccMax.value),
        marginalMin: Number(tMarMin.value),
        marginalMax: Number(tMarMax.value),
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
        excellentMaxFt: Number(wavesExcellent.value),
        acceptableMaxFt: Number(wavesAcceptable.value),
        marginalMaxFt: Number(wavesMarginal.value),
        minPeriodS: Number(wavesPeriod.value),
        protectedSectors: wavesWheel.getSelected(),
        protectedMaxFt: Number(wavesProtMax.value),
      },
    };
  }

  return { element: frag, read };
}
