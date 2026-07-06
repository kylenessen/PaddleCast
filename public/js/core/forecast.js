import { sunTimes } from "./sun.js";
import { evaluateHour } from "./evaluate.js";
import { mergePrefs } from "./prefs.js";
import { fetchWeather, fetchMarine } from "../providers/openmeteo.js";
import { fetchTides } from "../providers/noaatides.js";

// Treat a location-local "YYYY-MM-DDTHH:mm" string as if it were UTC to
// get a comparable millisecond value. Sun times (true UTC) are shifted
// into the same frame with the location's UTC offset.
function localMs(iso) {
  return Date.parse(iso + ":00Z");
}

function localIsoFromUtc(utcMs, offsetSeconds) {
  return new Date(utcMs + offsetSeconds * 1000).toISOString().slice(0, 16);
}

// Build the full evaluated forecast for one location.
//
// location: { name, lat, lon, prefs } (prefs may be partial; defaults fill in)
// options: { days } capped to 7, and optionally fetchWind(lat, lon, days),
// an async source of better hourly wind ([{ epoch, windMph, windDirDeg }],
// epoch in UTC seconds, or null when unavailable). When it delivers,
// its values replace Open-Meteo's wind hour by hour.
//
// Returns { location, timezone, generatedAt, windSource, warnings, days }
// where each day has { date, sun, hours } and each hour carries raw values
// plus the evaluation from core/evaluate.js. Only daylight hours are
// included, from civil dawn (first light) through civil dusk (last light).
export async function buildForecast(location, options = {}) {
  const days = Math.min(Math.max(options.days ?? 7, 1), 7);
  const prefs = mergePrefs(location.prefs);
  const warnings = [];

  const weather = await fetchWeather(location.lat, location.lon, days);

  let windSource = "open-meteo";
  if (options.fetchWind) {
    try {
      const windHours = await options.fetchWind(location.lat, location.lon, days);
      if (windHours && windHours.length > 0) {
        for (const h of windHours) {
          const iso = localIsoFromUtc(h.epoch * 1000, weather.utcOffsetSeconds);
          const record = weather.hours.get(iso);
          if (record && h.windMph != null) {
            record.windMph = h.windMph;
            if (h.windDirDeg != null) record.windDirDeg = h.windDirDeg;
          }
        }
        windSource = "tempest";
      }
    } catch (err) {
      warnings.push(`Tempest wind unavailable, using Open-Meteo wind: ${err.message}`);
    }
  }

  let marine = new Map();
  if (prefs.swell.enabled) {
    try {
      marine = await fetchMarine(location.lat, location.lon, days);
    } catch (err) {
      warnings.push(`Swell data unavailable: ${err.message}`);
    }
  }

  let tides = new Map();
  if (prefs.tide.enabled && prefs.tide.stationId) {
    try {
      tides = await fetchTides(prefs.tide.stationId, Date.now(), days);
    } catch (err) {
      warnings.push(`Tide data unavailable: ${err.message}`);
    }
  }

  // Group weather hours by local calendar date, in order.
  const byDate = new Map();
  for (const [iso, record] of weather.hours) {
    const date = iso.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ iso, ...record });
  }

  const offset = weather.utcOffsetSeconds;
  const todayLocal = localIsoFromUtc(Date.now(), offset).slice(0, 10);
  const nowLocalMs = localMs(localIsoFromUtc(Date.now(), offset));

  const outDays = [];
  for (const [date, records] of byDate) {
    if (date < todayLocal) continue;
    const [y, m, d] = date.split("-").map(Number);
    const sun = sunTimes({ y, m, d }, location.lat, location.lon);
    if (sun.firstLight == null || sun.lastLight == null) continue;
    const dawnLocal = sun.firstLight + offset * 1000;
    const duskLocal = sun.lastLight + offset * 1000;

    const hours = [];
    for (const record of records) {
      const start = localMs(record.iso);
      const end = start + 3600000;
      if (end <= dawnLocal || start >= duskLocal) continue;
      if (end <= nowLocalMs) continue; // skip hours already fully past
      const hour = {
        time: record.iso,
        tempF: record.tempF,
        weatherCode: record.weatherCode,
        windMph: record.windMph,
        windDirDeg: record.windDirDeg,
        tideFt: tides.get(record.iso) ?? null,
        swellFt: marine.get(record.iso)?.swellFt ?? null,
        swellPeriodS: marine.get(record.iso)?.swellPeriodS ?? null,
        swellDirDeg: marine.get(record.iso)?.swellDirDeg ?? null,
      };
      hours.push({ ...hour, ...evaluateHour(hour, prefs) });
    }
    if (hours.length === 0) continue;

    outDays.push({
      date,
      sun: {
        firstLight: localIsoFromUtc(sun.firstLight, offset),
        sunrise: localIsoFromUtc(sun.sunrise, offset),
        sunset: localIsoFromUtc(sun.sunset, offset),
        lastLight: localIsoFromUtc(sun.lastLight, offset),
      },
      hours,
    });
    if (outDays.length >= days) break;
  }

  return {
    location: { name: location.name, lat: location.lat, lon: location.lon },
    timezone: weather.timezone,
    generatedAt: new Date().toISOString(),
    windSource,
    warnings,
    days: outDays,
  };
}
