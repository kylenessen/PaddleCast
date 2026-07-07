// Open-Meteo weather and marine forecasts. Free, no API key, CORS
// enabled, so it works directly from the browser and from Cloudflare
// Pages Functions alike.
//
// Both endpoints are asked for Pacific-time timestamps. Every time
// string they return ("YYYY-MM-DDTHH:mm") is in that zone, and
// utcOffsetSeconds lets callers convert to UTC. The zone is hardcoded
// because every shipped location is on the California coast; revisit if
// locations ever span timezones.

const TIMEZONE = "America/Los_Angeles";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status}): ${url}`);
  }
  return res.json();
}

// Returns { utcOffsetSeconds, timezone, hours: Map<localIso, record> }
// where record has tempF, windMph, windDirDeg, weatherCode, and the
// three cloud-cover layers (percent) that feed the sunrise/sunset
// color prediction in core/glow.js.
export async function fetchWeather(lat, lon, days = 7) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly:
      "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m," +
      "cloud_cover_low,cloud_cover_mid,cloud_cover_high",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    forecast_days: String(days),
    timezone: TIMEZONE,
  });
  const data = await getJson(`${WEATHER_URL}?${params}`);
  const hours = new Map();
  const h = data.hourly;
  for (let i = 0; i < h.time.length; i++) {
    hours.set(h.time[i], {
      tempF: h.temperature_2m[i],
      weatherCode: h.weather_code[i],
      windMph: h.wind_speed_10m[i],
      windDirDeg: h.wind_direction_10m[i],
      cloudLowPct: h.cloud_cover_low?.[i] ?? null,
      cloudMidPct: h.cloud_cover_mid?.[i] ?? null,
      cloudHighPct: h.cloud_cover_high?.[i] ?? null,
    });
  }
  return {
    utcOffsetSeconds: data.utc_offset_seconds,
    timezone: data.timezone,
    hours,
  };
}

// Returns Map<localIso, { waveFt, wavePeriodS, waveDirDeg, swellFt,
// swellPeriodS, windWaveFt }>. waveFt is the total significant wave
// height, swell and wind waves combined, which is what the paddler
// actually feels. The swell component carries its own period because
// the blended wave_period mixes in short wind chop and understates how
// the swell itself rides; the steepness rule in core/evaluate.js needs
// the swell's own numbers.
// Throws if the point has no marine coverage (e.g. inland).
export async function fetchMarine(lat, lon, days = 7) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly:
      "wave_height,wave_period,wave_direction," +
      "swell_wave_height,swell_wave_period,wind_wave_height",
    length_unit: "imperial",
    forecast_days: String(days),
    timezone: TIMEZONE,
  });
  const data = await getJson(`${MARINE_URL}?${params}`);
  const hours = new Map();
  const h = data.hourly;
  for (let i = 0; i < h.time.length; i++) {
    hours.set(h.time[i], {
      waveFt: h.wave_height[i],
      wavePeriodS: h.wave_period[i],
      waveDirDeg: h.wave_direction[i],
      swellFt: h.swell_wave_height[i],
      swellPeriodS: h.swell_wave_period[i],
      windWaveFt: h.wind_wave_height[i],
    });
  }
  return hours;
}
