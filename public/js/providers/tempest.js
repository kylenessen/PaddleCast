// WeatherFlow Tempest "better forecast" hourly wind. Needs a personal
// access token, so browsers never call this directly; the /api/wind
// Pages Function holds the token (TEMPEST_TOKEN) and proxies. The API
// endpoint itself accepts arbitrary lat/lon, no station required.

const URL_BASE = "https://swd.weatherflow.com/swd/rest/better_forecast";

// Returns [{ epoch, windMph, windDirDeg, gustMph }] hourly for up to
// `days` days. `epoch` is UTC seconds at the top of each hour.
export async function fetchTempestWind(lat, lon, token, days = 7) {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lon: lon.toFixed(4),
    units_wind: "mph",
    token,
  });
  const res = await fetch(`${URL_BASE}?${params}`);
  if (!res.ok) throw new Error(`Tempest request failed (${res.status})`);
  const data = await res.json();
  const hourly = data.forecast?.hourly ?? [];
  const cutoff = Date.now() / 1000 + days * 86400;
  return hourly
    .filter((h) => h.time <= cutoff)
    .map((h) => ({
      epoch: h.time,
      windMph: h.wind_avg,
      windDirDeg: h.wind_direction,
      gustMph: h.wind_gust,
    }));
}
