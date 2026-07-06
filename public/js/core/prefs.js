// Per-location preference schema and defaults.
//
// Direction preferences use 16 compass sectors, index 0 = N through
// 15 = NNW, each spanning 22.5 degrees. "Protected" sectors model
// terrain shielding: when wind or waves arrive from a protected
// sector, the tolerated upper limit is extended.
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
      // Beaufort level boundaries: <= good is blue/green,
      // <= max is yellow, above max is red. Grounded in the
      // observation study: force 0-1 rated good, force 2 a coin flip,
      // force 3 in forecast terms is the tolerance ceiling.
      goodMax: 1,
      max: 3,
      // Sectors treated as terrain-protected, and the extended limit
      // that applies when wind comes from one of them.
      protectedSectors: [],
      protectedMax: 4,
    },
    temp: {
      // Degrees F. min/max are the red boundaries, sweet spot is blue.
      min: 55,
      max: 85,
      sweetMin: 62,
      sweetMax: 78,
    },
    // Condition category id -> "good" | "marginal" | "bad".
    conditions: {
      sunny: "good",
      partly: "good",
      overcast: "marginal",
      fog: "marginal",
      drizzle: "bad",
      rain: "bad",
      storm: "bad",
    },
    tide: {
      enabled: false,
      stationId: "",
      minFt: 2.5,
      // Within this many feet above the minimum counts as marginal.
      marginFt: 0.5,
    },
    waves: {
      // Total significant wave height, swell and wind waves combined.
      enabled: false,
      goodMaxFt: 2,
      maxFt: 4,
      minPeriodS: 8,
      protectedSectors: [],
      protectedMaxFt: 6,
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

// Deep-merge stored prefs over defaults so older saved locations pick
// up new fields without breaking.
export function mergePrefs(stored) {
  const base = defaultPrefs();
  if (!stored) return base;
  // Older saves called the marine section "swell"; it is now "waves"
  // (total wave height). Carry the values across.
  if (stored.swell && !stored.waves) {
    stored = { ...stored, waves: stored.swell };
  }
  return overlay(base, stored);
}
