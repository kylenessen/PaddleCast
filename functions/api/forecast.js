// JSON API for external tools (cron jobs, notification scripts).
// Runs the same forecast logic as the website and returns the raw
// evaluated data instead of rendering UI.
//
// POST /api/forecast
//   Body: { name?, lat, lon, days?, prefs? }
//   prefs follows the same shape the website stores; anything omitted
//   falls back to defaults (see public/js/core/prefs.js).
//
// GET /api/forecast?lat=35.34&lon=-120.83&days=3&station=9412110&minTide=2.5
//   Convenience form covering the common fields.

import { buildForecast } from "../../public/js/core/forecast.js";
import { fetchTempestWind } from "../../public/js/providers/tempest.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function handle(payload, env) {
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "lat and lon are required numbers" }, 400);
  }
  const location = {
    name: payload.name ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    lat,
    lon,
    prefs: payload.prefs ?? {},
  };
  // With a TEMPEST_TOKEN secret set, Tempest wind replaces Open-Meteo's.
  const fetchWind = env?.TEMPEST_TOKEN
    ? (la, lo, days) => fetchTempestWind(la, lo, env.TEMPEST_TOKEN, days)
    : undefined;
  const forecast = await buildForecast(location, { days: payload.days, fetchWind });
  return json(forecast);
}

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "request body must be JSON" }, 400);
  }
  try {
    return await handle(payload, env);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const payload = {
    lat: q.get("lat"),
    lon: q.get("lon"),
    name: q.get("name") ?? undefined,
    days: q.get("days") ? Number(q.get("days")) : undefined,
    prefs: {},
  };
  if (q.get("station")) {
    payload.prefs.tide = {
      enabled: true,
      stationId: q.get("station"),
      ...(q.get("minTide") ? { minFt: Number(q.get("minTide")) } : {}),
    };
  }
  if (q.get("swell") === "1") {
    payload.prefs.swell = { enabled: true };
  }
  try {
    return await handle(payload, env);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
