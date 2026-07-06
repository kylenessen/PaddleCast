// Proxies Tempest hourly wind so the access token stays in a Cloudflare
// environment secret (TEMPEST_TOKEN). Returns { source, hours } or 404
// when no token is configured, which tells the site to stay on
// Open-Meteo wind.

import { fetchTempestWind } from "../../public/js/providers/tempest.js";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...extra,
    },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.TEMPEST_TOKEN) {
    return json({ error: "TEMPEST_TOKEN is not configured" }, 404);
  }
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "lat and lon are required numbers" }, 400);
  }
  const days = Number(q.get("days")) || 7;
  try {
    const hours = await fetchTempestWind(lat, lon, env.TEMPEST_TOKEN, days);
    return json(
      { source: "tempest", hours },
      200,
      { "cache-control": "public, max-age=600" }
    );
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
