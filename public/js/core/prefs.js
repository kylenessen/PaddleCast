// Per-location preference schema and defaults.
//
// Direction preferences use 16 compass sectors, index 0 = N through
// 15 = NNW, each spanning 22.5 degrees. "Protected" sectors model
// terrain shielding: when wind arrives from a protected sector, the
// tolerated upper limit is extended. Only wind uses them; swell
// shielding is a launch concern, not an on-the-water one.
//
// Every metric rates into four categories: excellent, acceptable,
// marginal, notForMe. Wind, temperature, and waves use nested
// thresholds (excellent inside acceptable inside marginal); sky
// conditions map each weather type to a category directly; tide is a
// gate with a marginal buffer above the minimum.
//
// The values below are the built-in schema fallback. The shipped
// defaults everyone sees live in config.json at the site root and are
// overlaid on top (see config.js). Edit config.json, not this file, to
// retune the site.

import { getConfigDefaults } from "../config.js";

export const SECTOR_NAMES = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function sectorFromDegrees(deg) {
  return Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
}

function builtinPrefs() {
  return {
    wind: {
      // Beaufort level ceilings for each tier. Grounded in the
      // observation study: force 0-1 rated good, force 2 a coin flip,
      // force 3 in forecast terms is the tolerance ceiling.
      excellentMax: 1,
      acceptableMax: 2,
      marginalMax: 3,
      // Sectors treated as terrain-protected, and the extended
      // marginal ceiling that applies when wind comes from one.
      protectedSectors: [],
      protectedMax: 4,
    },
    temp: {
      // Degrees F, three nested ranges. Outside marginal is notForMe.
      excellentMin: 65,
      excellentMax: 75,
      acceptableMin: 60,
      acceptableMax: 80,
      marginalMin: 55,
      marginalMax: 85,
    },
    // Condition category id -> excellent | acceptable | marginal | notForMe.
    conditions: {
      sunny: "excellent",
      partly: "acceptable",
      overcast: "marginal",
      fog: "marginal",
      drizzle: "notForMe",
      rain: "notForMe",
      storm: "notForMe",
    },
    tide: {
      enabled: false,
      stationId: "",
      minFt: 2.5,
      // Within this many feet above the minimum counts as marginal.
      marginFt: 0.5,
    },
    waves: {
      // Height tiers rate total significant wave height, swell and wind
      // waves combined. periodRatio is the steepness rule: swell rides
      // comfortably when its period (s) is at least this multiple of
      // its height (ft). See evalWaves in evaluate.js.
      enabled: false,
      excellentMaxFt: 2,
      acceptableMaxFt: 3,
      marginalMaxFt: 4,
      periodRatio: 2,
    },
  };
}

// One-level deep merge: each top-level section merges over the base so
// a partial override picks up the rest of the section from defaults.
function overlay(base, over) {
  if (!over) return base;
  for (const key of Object.keys(base)) {
    if (over[key] && typeof over[key] === "object") {
      base[key] = { ...base[key], ...over[key] };
    }
  }
  return base;
}

export function defaultPrefs() {
  return overlay(builtinPrefs(), getConfigDefaults());
}

const OLD_CONDITION_VALUES = {
  good: "acceptable",
  marginal: "marginal",
  bad: "notForMe",
};

// Saves from the three-status era (good/marginal/bad) carry old keys.
// Map them onto the four-category schema: the old good ceiling becomes
// the excellent ceiling, the old max becomes the marginal ceiling, and
// the acceptable tier lands between them.
function migrateStored(stored) {
  const out = { ...stored };
  // Older saves called the marine section "swell"; it is now "waves"
  // (total wave height). Carry the values across.
  if (out.swell && !out.waves) out.waves = out.swell;
  if (out.wind && out.wind.excellentMax == null && out.wind.goodMax != null) {
    const w = out.wind;
    out.wind = {
      excellentMax: w.goodMax,
      acceptableMax: Math.min(w.max, w.goodMax + 1),
      marginalMax: w.max,
      protectedSectors: w.protectedSectors ?? [],
      protectedMax: w.protectedMax ?? w.max + 1,
    };
  }
  if (out.temp && out.temp.excellentMin == null && out.temp.sweetMin != null) {
    const t = out.temp;
    out.temp = {
      excellentMin: t.sweetMin,
      excellentMax: t.sweetMax,
      acceptableMin: Math.round((t.min + t.sweetMin) / 2),
      acceptableMax: Math.round((t.max + t.sweetMax) / 2),
      marginalMin: t.min,
      marginalMax: t.max,
    };
  }
  if (out.conditions) {
    out.conditions = Object.fromEntries(
      Object.entries(out.conditions).map(([k, v]) => [
        k,
        OLD_CONDITION_VALUES[v] ?? v,
      ])
    );
  }
  if (
    out.waves &&
    out.waves.excellentMaxFt == null &&
    out.waves.goodMaxFt != null
  ) {
    const w = out.waves;
    out.waves = {
      enabled: w.enabled ?? false,
      excellentMaxFt: w.goodMaxFt,
      acceptableMaxFt: (w.goodMaxFt + w.maxFt) / 2,
      marginalMaxFt: w.maxFt,
    };
  }
  // The wave rule used a fixed minimum period and direction shielding
  // before the steepness ratio replaced them. Terrain shielding from
  // swell is a launch concern, not an on-the-water one, so those keys
  // just drop; the ratio comes in from defaults.
  if (out.waves) {
    const { minPeriodS, protectedSectors, protectedMaxFt, ...rest } =
      out.waves;
    out.waves = rest;
  }
  return out;
}

// Deep-merge stored prefs over defaults so older saved locations pick
// up new fields without breaking. `globalPrefs` is the visitor's own
// default thresholds (see storage.js); it layers between the shipped
// defaults and the per-location overrides, and is passed in rather than
// imported so this module stays usable outside the browser.
export function mergePrefs(stored, globalPrefs) {
  let base = defaultPrefs();
  if (globalPrefs) base = overlay(base, migrateStored(globalPrefs));
  if (!stored) return base;
  return overlay(base, migrateStored(stored));
}
