// NOAA Tides & Currents hourly predictions for a user-supplied station.
// Uses MLLW datum in feet with station-local timestamps, which matches
// the local timestamps Open-Meteo returns for nearby coordinates.

const BASE_URL =
  "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

// Returns Map<"YYYY-MM-DDTHH:00", feet>. `startUtcMs` should be the
// start of the forecast window; the request spans `days` days.
export async function fetchTides(stationId, startUtcMs, days = 7) {
  const begin = new Date(startUtcMs - 86400000); // pad a day on each side
  const end = new Date(startUtcMs + (days + 1) * 86400000);
  const params = new URLSearchParams({
    product: "predictions",
    application: "PaddleCast",
    station: stationId,
    begin_date: fmtDate(begin),
    end_date: fmtDate(end),
    datum: "MLLW",
    units: "english",
    time_zone: "lst_ldt",
    interval: "h",
    format: "json",
  });
  const res = await fetch(`${BASE_URL}?${params}`);
  if (!res.ok) throw new Error(`NOAA tides request failed (${res.status})`);
  const data = await res.json();
  if (data.error) {
    throw new Error(`NOAA tides: ${data.error.message ?? "unknown error"}`);
  }
  const hours = new Map();
  for (const p of data.predictions ?? []) {
    // p.t is "YYYY-MM-DD HH:MM" in station-local time.
    hours.set(p.t.replace(" ", "T").slice(0, 13) + ":00", parseFloat(p.v));
  }
  return hours;
}
