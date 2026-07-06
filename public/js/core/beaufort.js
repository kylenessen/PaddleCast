// Beaufort wind scale. Speeds are in mph.
export const BEAUFORT = [
  { level: 0, name: "Calm", max: 1 },
  { level: 1, name: "Light air", max: 3 },
  { level: 2, name: "Light breeze", max: 7 },
  { level: 3, name: "Gentle breeze", max: 12 },
  { level: 4, name: "Moderate breeze", max: 18 },
  { level: 5, name: "Fresh breeze", max: 24 },
  { level: 6, name: "Strong breeze", max: 31 },
  { level: 7, name: "Near gale", max: 38 },
  { level: 8, name: "Gale", max: 46 },
  { level: 9, name: "Strong gale", max: 54 },
  { level: 10, name: "Storm", max: 63 },
  { level: 11, name: "Violent storm", max: 72 },
  { level: 12, name: "Hurricane", max: Infinity },
];

export function beaufortFromMph(mph) {
  for (const b of BEAUFORT) {
    if (mph <= b.max) return b;
  }
  return BEAUFORT[BEAUFORT.length - 1];
}

// The mph span a level covers, for select labels: "0-1", "8-12".
export function beaufortMphRange(level) {
  const min = level === 0 ? 0 : BEAUFORT[level - 1].max + 1;
  const max = BEAUFORT[level].max;
  return max === Infinity ? `${min}+` : `${min}-${max}`;
}
