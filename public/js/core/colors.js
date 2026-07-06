// Color schemes for condition statuses. Default is green-to-red, with a
// blue-to-red option for colorblind accessibility.

export const SCHEMES = {
  "green-red": {
    label: "Green to red (default)",
    good: "#2e9e44",
    marginal: "#e2b93b",
    bad: "#d84b3a",
  },
  "blue-red": {
    label: "Blue to red (colorblind friendly)",
    good: "#3573d9",
    marginal: "#e2b93b",
    bad: "#d84b3a",
  },
};

export function statusColor(status, schemeId) {
  const scheme = SCHEMES[schemeId] ?? SCHEMES["green-red"];
  return scheme[status] ?? scheme.marginal;
}

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

// Continuous ramp position, GIS style: 0 is the good color, 0.5 the
// marginal color, 1 the bad color, and scores in between land on
// intermediate shades along the ramp. All-good stays exactly good;
// two goods and a marginal sit a shade toward yellow.
export function rampColor(score, schemeId) {
  const scheme = SCHEMES[schemeId] ?? SCHEMES["green-red"];
  const t = Math.min(Math.max(score, 0), 1) * 2;
  if (t <= 1) return mix(scheme.good, scheme.marginal, t);
  return mix(scheme.marginal, scheme.bad, t - 1);
}
