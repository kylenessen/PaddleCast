// Sunrise and sunset color prediction from layered cloud cover.
//
// The heuristic photographers use, in miniature. Mid and high clouds
// act as a screen for reddened light passing beneath them, so a partly
// covered upper sky lights up while a clear one just fades. Low clouds
// sit in the light path at the horizon and block the show entirely,
// and full overcast at any level reads gray. Open-Meteo already
// forecasts the three layers, so no extra request is needed.

// 1 at the ideal coverage, falling to 0 at fully clear and overcast.
function screen(pct, ideal, width) {
  const t = (pct - ideal) / width;
  return Math.max(0, 1 - t * t);
}

// hour: a weather record with cloudLowPct / cloudMidPct / cloudHighPct.
// Returns { score, label, detail } where score runs 0 (gray or plain)
// to 1 (fire in the sky) and label is a short display phrase, or null
// when the cloud layers are missing.
export function glowQuality(hour) {
  const low = hour.cloudLowPct;
  const mid = hour.cloudMidPct;
  const high = hour.cloudHighPct;
  if (low == null || mid == null || high == null) return null;

  // High clouds make the best canvas, mid clouds a slightly dimmer one.
  const canvas = Math.max(screen(high, 45, 45), 0.8 * screen(mid, 40, 40));
  // Low clouds block horizon light; past ~60% coverage the show is off.
  const blocked = Math.min(low / 60, 1);
  const score = canvas * (1 - blocked);

  let label;
  if (blocked >= 1) label = "clouded out";
  else if (score >= 0.65) label = "vivid colors likely";
  else if (score >= 0.4) label = "good color likely";
  else if (score >= 0.15) label = "a little color possible";
  else label = "little color expected";

  return {
    score,
    label,
    detail: `cloud cover low ${Math.round(low)}% · mid ${Math.round(mid)}% · high ${Math.round(high)}%`,
  };
}
