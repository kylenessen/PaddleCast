// Default locations shipped with the site. Hand-edit this file to add,
// remove, or retune the spots everyone sees without any setup.
//
// ids are stable slugs, so a link like #/loc/baywood?day=2026-07-10
// opens the same place for anyone. Visitors can still edit a default in
// their browser (stored in localStorage, shadowing the entry with the
// same id) or add their own spots, which get random ids.
//
// prefs are partial overrides of defaultPrefs() in core/prefs.js.
// Anything omitted falls back to the defaults there.

export const DEFAULT_LOCATIONS = [
  {
    id: "baywood",
    name: "Baywood",
    lat: 35.32676,
    lon: -120.84213,
    prefs: {
      tide: { enabled: true, stationId: "9412110", minFt: 2.5 },
    },
  },
  {
    id: "morro-bay",
    name: "Morro Bay",
    lat: 35.35921,
    lon: -120.85010,
    prefs: {
      tide: { enabled: true, stationId: "9412110", minFt: 2.5 },
    },
  },
  {
    id: "cayucos",
    name: "Cayucos",
    lat: 35.44790,
    lon: -120.90600,
    prefs: {
      swell: { enabled: true },
    },
  },
  {
    id: "avila-beach",
    name: "Avila Beach",
    lat: 35.17910,
    lon: -120.73180,
    prefs: {
      swell: { enabled: true },
    },
  },
];
