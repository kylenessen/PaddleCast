// Per-location preference schema and defaults.
//
// Direction preferences use 16 compass sectors, index 0 = N through
// 15 = NNW, each spanning 22.5 degrees. "Protected" sectors model
// terrain shielding: when wind or swell arrives from a protected
// sector, the tolerated upper limit is extended.

export const SECTOR_NAMES = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function sectorFromDegrees(deg) {
  return Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
}

export function defaultPrefs() {
  return {
    wind: {
      // Beaufort level boundaries: <= good is blue/green,
      // <= marginal is yellow, <= max is orange-ish, above max is red.
      goodMax: 3,
      max: 5,
      // Sectors treated as terrain-protected, and the extended limit
      // that applies when wind comes from one of them.
      protectedSectors: [],
      protectedMax: 6,
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
    swell: {
      enabled: false,
      goodMaxFt: 3,
      maxFt: 6,
      minPeriodS: 8,
      protectedSectors: [],
      protectedMaxFt: 8,
    },
  };
}

// Deep-merge stored prefs over defaults so older saved locations pick
// up new fields without breaking.
export function mergePrefs(stored) {
  const base = defaultPrefs();
  if (!stored) return base;
  for (const key of Object.keys(base)) {
    if (stored[key] && typeof stored[key] === "object") {
      base[key] = { ...base[key], ...stored[key] };
    }
  }
  return base;
}
