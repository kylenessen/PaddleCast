import { beaufortFromMph } from "./beaufort.js";
import { sectorFromDegrees, SECTOR_NAMES } from "./prefs.js";
import { categoryFromWmoCode, describeWmoCode } from "./wmo.js";

// Each metric rates its hour into one of four categories, ordered by
// severity. An hour's overall category is the worst of its metrics.
export const CATEGORY_ORDER = {
  excellent: 0,
  acceptable: 1,
  marginal: 2,
  notForMe: 3,
};

// Ramp position of each category on the 0..1 score scale. Excellent,
// acceptable, and marginal sit at the first three color-ramp anchors;
// notForMe is the far end.
export const CATEGORY_VALUE = {
  excellent: 0,
  acceptable: 1 / 3,
  marginal: 2 / 3,
  notForMe: 1,
};

export const CATEGORY_LABELS = {
  excellent: "Excellent",
  acceptable: "Acceptable",
  marginal: "Marginal",
  notForMe: "Not for me",
};

function worst(categories) {
  return categories.reduce(
    (acc, c) => (CATEGORY_ORDER[c] > CATEGORY_ORDER[acc] ? c : acc),
    "excellent"
  );
}

function evalWind(hour, prefs) {
  const b = beaufortFromMph(hour.windMph);
  const sector = sectorFromDegrees(hour.windDirDeg);
  const isProtected = prefs.wind.protectedSectors.includes(sector);
  // Protected directions extend the marginal ceiling, not the nicer tiers.
  const marginalLimit = isProtected
    ? Math.max(prefs.wind.marginalMax, prefs.wind.protectedMax)
    : prefs.wind.marginalMax;
  let category;
  if (b.level <= prefs.wind.excellentMax) category = "excellent";
  else if (b.level <= prefs.wind.acceptableMax) category = "acceptable";
  else if (b.level <= marginalLimit) category = "marginal";
  else category = "notForMe";
  return {
    category,
    value: `${Math.round(hour.windMph)} mph ${SECTOR_NAMES[sector]}`,
    detail: `Beaufort ${b.level} (${b.name})` +
      (isProtected && b.level > prefs.wind.marginalMax
        ? ", allowed by protected direction"
        : ""),
  };
}

function evalTemp(hour, prefs) {
  const t = hour.tempF;
  const p = prefs.temp;
  let category;
  if (t >= p.excellentMin && t <= p.excellentMax) category = "excellent";
  else if (t >= p.acceptableMin && t <= p.acceptableMax) category = "acceptable";
  else if (t >= p.marginalMin && t <= p.marginalMax) category = "marginal";
  else category = "notForMe";
  return { category, value: `${Math.round(t)}°F`, detail: "" };
}

function evalConditions(hour, prefs) {
  const kind = categoryFromWmoCode(hour.weatherCode);
  const category = prefs.conditions[kind] ?? "marginal";
  return { category, value: describeWmoCode(hour.weatherCode), detail: "" };
}

// Tide is a gate, not a quality scale: enough water or not, with a
// marginal buffer just above the minimum.
function evalTide(hour, prefs) {
  if (hour.tideFt == null) {
    return { category: "marginal", value: "no data", detail: "" };
  }
  const { minFt, marginFt } = prefs.tide;
  let category;
  if (hour.tideFt < minFt) category = "notForMe";
  else if (hour.tideFt < minFt + marginFt) category = "marginal";
  else category = "excellent";
  return { category, value: `${hour.tideFt.toFixed(1)} ft`, detail: "MLLW" };
}

// Rates the total sea state: waveFt is significant wave height with
// swell and wind waves combined, per the observation study (a small
// swell plus wind chop can still be a no-go). The minimum period only
// gates the excellent tier; short-period water at excellent height
// paddles like merely acceptable water, not dangerous water.
function evalWaves(hour, prefs) {
  if (hour.waveFt == null) {
    return { category: "marginal", value: "no data", detail: "" };
  }
  const p = prefs.waves;
  const sector = sectorFromDegrees(hour.waveDirDeg ?? 0);
  const isProtected = p.protectedSectors.includes(sector);
  const marginalLimit = isProtected
    ? Math.max(p.marginalMaxFt, p.protectedMaxFt)
    : p.marginalMaxFt;
  const periodOk =
    hour.wavePeriodS == null || hour.wavePeriodS >= p.minPeriodS;
  let category;
  if (hour.waveFt > marginalLimit) category = "notForMe";
  else if (hour.waveFt <= p.excellentMaxFt && periodOk) category = "excellent";
  else if (hour.waveFt <= p.acceptableMaxFt) category = "acceptable";
  else category = "marginal";
  // Components are shown for context, not as a sum: wave heights
  // combine non-linearly and the total also includes secondary swell
  // trains Open-Meteo does not break out.
  const details = [];
  if (hour.swellFt != null && hour.windWaveFt != null) {
    details.push(
      `primary swell ${hour.swellFt.toFixed(1)} ft, wind chop ${hour.windWaveFt.toFixed(1)} ft`
    );
  }
  if (isProtected && hour.waveFt > p.marginalMaxFt) {
    details.push("allowed by protected direction");
  }
  return {
    category,
    value: `${hour.waveFt.toFixed(1)} ft @ ${
      hour.wavePeriodS != null ? Math.round(hour.wavePeriodS) : "?"
    }s ${SECTOR_NAMES[sector]}`,
    detail: details.join(", "),
  };
}

// hour: merged hourly record from core/forecast.js.
// Returns { metrics: { wind, temp, conditions, tide?, waves? }, overall,
// score }. `overall` is the worst metric category. `score` is the hour's
// ramp position: any notForMe metric pins it to 1; otherwise the mean
// of the metric category values, so an all-excellent hour is 0 and an
// all-marginal hour is 2/3.
export function evaluateHour(hour, prefs) {
  const metrics = {
    wind: evalWind(hour, prefs),
    temp: evalTemp(hour, prefs),
    conditions: evalConditions(hour, prefs),
  };
  if (prefs.tide.enabled) metrics.tide = evalTide(hour, prefs);
  if (prefs.waves.enabled) metrics.waves = evalWaves(hour, prefs);
  const categories = Object.values(metrics).map((m) => m.category);
  const overall = worst(categories);
  const score =
    overall === "notForMe"
      ? 1
      : categories.reduce((sum, c) => sum + CATEGORY_VALUE[c], 0) /
        categories.length;
  return { metrics, overall, score };
}
