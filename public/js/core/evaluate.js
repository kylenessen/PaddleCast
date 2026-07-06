import { beaufortFromMph } from "./beaufort.js";
import { sectorFromDegrees, SECTOR_NAMES } from "./prefs.js";
import { categoryFromWmoCode, describeWmoCode } from "./wmo.js";

// Statuses are ordered by severity. An hour's overall status is the
// worst of its metric statuses, per the spec: one red makes the hour red.
export const STATUS_ORDER = { good: 0, marginal: 1, bad: 2 };

function worst(statuses) {
  return statuses.reduce(
    (acc, s) => (STATUS_ORDER[s] > STATUS_ORDER[acc] ? s : acc),
    "good"
  );
}

function evalWind(hour, prefs) {
  const b = beaufortFromMph(hour.windMph);
  const sector = sectorFromDegrees(hour.windDirDeg);
  const isProtected = prefs.wind.protectedSectors.includes(sector);
  const limit = isProtected
    ? Math.max(prefs.wind.max, prefs.wind.protectedMax)
    : prefs.wind.max;
  let status;
  if (b.level > limit) status = "bad";
  else if (b.level <= prefs.wind.goodMax) status = "good";
  else status = "marginal";
  return {
    status,
    value: `${Math.round(hour.windMph)} mph ${SECTOR_NAMES[sector]}`,
    detail: `Beaufort ${b.level} (${b.name})` +
      (isProtected && b.level > prefs.wind.max ? ", allowed by protected direction" : ""),
  };
}

function evalTemp(hour, prefs) {
  const t = hour.tempF;
  const { min, max, sweetMin, sweetMax } = prefs.temp;
  let status;
  if (t < min || t > max) status = "bad";
  else if (t >= sweetMin && t <= sweetMax) status = "good";
  else status = "marginal";
  return { status, value: `${Math.round(t)}°F`, detail: "" };
}

function evalConditions(hour, prefs) {
  const category = categoryFromWmoCode(hour.weatherCode);
  const status = prefs.conditions[category] ?? "marginal";
  return { status, value: describeWmoCode(hour.weatherCode), detail: "" };
}

function evalTide(hour, prefs) {
  if (hour.tideFt == null) {
    return { status: "marginal", value: "no data", detail: "" };
  }
  const { minFt, marginFt } = prefs.tide;
  let status;
  if (hour.tideFt < minFt) status = "bad";
  else if (hour.tideFt < minFt + marginFt) status = "marginal";
  else status = "good";
  return { status, value: `${hour.tideFt.toFixed(1)} ft`, detail: "MLLW" };
}

// Rates the total sea state: waveFt is significant wave height with
// swell and wind waves combined, per the observation study (a small
// swell plus wind chop can still be a no-go).
function evalWaves(hour, prefs) {
  if (hour.waveFt == null) {
    return { status: "marginal", value: "no data", detail: "" };
  }
  const sector = sectorFromDegrees(hour.waveDirDeg ?? 0);
  const isProtected = prefs.waves.protectedSectors.includes(sector);
  const limit = isProtected
    ? Math.max(prefs.waves.maxFt, prefs.waves.protectedMaxFt)
    : prefs.waves.maxFt;
  let status;
  if (hour.waveFt > limit) status = "bad";
  else if (
    hour.waveFt <= prefs.waves.goodMaxFt &&
    (hour.wavePeriodS == null || hour.wavePeriodS >= prefs.waves.minPeriodS)
  ) status = "good";
  else status = "marginal";
  // Components are shown for context, not as a sum: wave heights
  // combine non-linearly and the total also includes secondary swell
  // trains Open-Meteo does not break out.
  const details = [];
  if (hour.swellFt != null && hour.windWaveFt != null) {
    details.push(
      `primary swell ${hour.swellFt.toFixed(1)} ft, wind chop ${hour.windWaveFt.toFixed(1)} ft`
    );
  }
  if (isProtected && hour.waveFt > prefs.waves.maxFt) {
    details.push("allowed by protected direction");
  }
  return {
    status,
    value: `${hour.waveFt.toFixed(1)} ft @ ${
      hour.wavePeriodS != null ? Math.round(hour.wavePeriodS) : "?"
    }s ${SECTOR_NAMES[sector]}`,
    detail: details.join(", "),
  };
}

// hour: merged hourly record from core/forecast.js.
// Returns { metrics: { wind, temp, conditions, tide?, waves? }, overall,
// score }. `overall` is the worst metric status. `score` is the hour's
// ramp position: any bad metric pins it to 1 (full red); otherwise the
// fraction of good metrics sets the spot on the full ramp regardless of
// how many metrics there are. All good is 0 (green), half good is 0.5
// (yellow), a quarter good is 0.75 (between yellow and red).
export function evaluateHour(hour, prefs) {
  const metrics = {
    wind: evalWind(hour, prefs),
    temp: evalTemp(hour, prefs),
    conditions: evalConditions(hour, prefs),
  };
  if (prefs.tide.enabled) metrics.tide = evalTide(hour, prefs);
  if (prefs.waves.enabled) metrics.waves = evalWaves(hour, prefs);
  const statuses = Object.values(metrics).map((m) => m.status);
  const overall = worst(statuses);
  const goodCount = statuses.filter((s) => s === "good").length;
  const score =
    overall === "bad" ? 1 : 1 - goodCount / statuses.length;
  return { metrics, overall, score };
}
