# PaddleCast

Kayak condition forecasts for the places you paddle, judged by your own thresholds. Instead of scoring conditions with an algorithm, PaddleCast gathers the relevant numbers in one readable place and color-codes them against preferences you set per location.

- Live site: [paddlecast.org](https://paddlecast.org)

## How it works

The site is a static single page app with no build step. When you load it, the browser fetches fresh forecasts directly from the data sources, so there is no scheduled pipeline and nothing goes stale. Locations and preferences live in localStorage on your device. There are no accounts and no server-side state.

You add a location by dropping a point on a map and naming it. Each location gets its own preferences. Wind tolerance is set as a maximum Beaufort level, temperature as a range with a sweet spot, sky conditions as per-category ratings, tide as a minimum height against a NOAA station you specify, and swell as a size range with a minimum period. Wind and swell each have a compass wheel where you mark terrain-protected directions, which raises the tolerated maximum when conditions arrive from those headings.

Forecasts cover daylight hours only, from civil first light through last light, so sunrise and sunset paddles are visible without nighttime clutter. Each hour shows a colored dot per metric, and the whole hour takes the color of its worst metric. The home page stacks a week view for every saved location, with each day rendered as a stripe of its hourly colors. Click a day to drill into the hourly detail.

Colors default to green-to-red, with a blue-to-red colorblind-friendly scheme in app settings.

## Data sources

- Weather and swell: [Open-Meteo](https://open-meteo.com) forecast and marine APIs. Free, no API key.
- Tides: [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov) predictions (MLLW) for a user-supplied station ID.
- Sun times are computed locally using the NOAA solar equations.

## JSON API

For notification tools and cron jobs, the same forecast logic is exposed as a Cloudflare Pages Function that returns raw JSON instead of rendering UI.

```
POST /api/forecast
{ "name": "Baywood", "lat": 35.34, "lon": -120.83, "days": 3,
  "prefs": { "tide": { "enabled": true, "stationId": "9412110", "minFt": 2.5 } } }
```

A GET form covers the common fields: `/api/forecast?lat=35.34&lon=-120.83&station=9412110&minTide=2.5&swell=1`. The `prefs` object accepts everything the website stores, see [prefs.js](public/js/core/prefs.js) for the schema and defaults. The response contains each daylight hour's raw values plus its evaluation against the supplied preferences.

## Development

There is no build step. For the static site alone, any file server works:

```
python3 -m http.server -d public 8788
```

To run with the API function, use Wrangler:

```
npx wrangler pages dev public
```

## Deployment

Deployed on Cloudflare Pages. Connect the repo in the Cloudflare dashboard with no build command and `public` as the output directory (also declared in `wrangler.toml`). The `functions/` directory is picked up automatically.

## Project structure

- `public/` — the site. `js/core/` holds forecast logic shared with the API, `js/providers/` the data source clients, `js/ui/` the views.
- `functions/api/forecast.js` — the JSON endpoint.
