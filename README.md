# PaddleCast

Kayak condition forecasts for the places you paddle, judged by your own thresholds. Instead of scoring conditions with an algorithm, PaddleCast gathers the relevant numbers in one readable place and color-codes them against preferences you set per location.

- Live site: [paddlecast.org](https://paddlecast.org)

## How it works

The site is a static single page app with no build step. When you load it, the browser fetches fresh forecasts directly from the data sources, so there is no scheduled pipeline and nothing goes stale. There are no accounts and no server-side state.

The default filter thresholds and the default locations everyone sees ship in [public/config.json](public/config.json), a plain JSON file that diffs cleanly. Edit it by hand or with the form-based editor at `/edit.html` (see [Editing the config](#editing-the-config) below), then commit to main and the Cloudflare Pages deploy updates the site. Any changes a visitor makes in the browser live in localStorage on their device, persist across visits, and shadow the shipped defaults without touching them. Visitors can set their own thresholds for every location at once on the settings page. Those sit between the shipped defaults and any per-location overrides, so a spot's own preferences page still wins for that spot.

Adding and deleting locations is currently maintainer-only. The map picker still exists at the `#/add` route but the site does not link to it. Locations for everyone are added through config.json.

Day links carry the location id and calendar date, like `paddlecast.org/#/loc/baywood?day=2026-07-10`, so you can send someone a specific day at a specific spot and they open exactly what you see.

Every metric rates each hour into one of four categories: excellent, acceptable, marginal, or not for me.

Each location gets its own preferences. Wind tolerance is a Beaufort ceiling per tier, temperature is three nested ranges (a tight excellent range inside a wider acceptable range inside the marginal range), sky conditions map each weather type to a category, tide is a minimum height against a NOAA station you specify, and waves are nested height ceilings with a minimum period for the excellent tier. The wave metric is total significant wave height, swell and wind waves combined, since a small swell with heavy wind chop on top paddles like a big one. Wind and waves each have a compass wheel where you mark terrain-protected directions, which raises the tolerated marginal ceiling when conditions arrive from those headings.

The shipped defaults come from the [observation study](analysis/observations/REPORT.md): wind is excellent through Beaufort 1, acceptable at Beaufort 2, and marginal at Beaufort 3. Waves are excellent under 2 ft, acceptable under 3 ft, and marginal under 4 ft of combined height.

Forecasts cover daylight hours only, from civil first light through last light, so sunrise and sunset paddles are visible without nighttime clutter. Each metric is shown in the color of its own category. The hour as a whole gets one score built from weighted components: wind counts as one component, waves (when enabled) as one, and comfort as one, where comfort is the worse of temperature and sky conditions. If any metric lands on not-for-me the score pins to the red end regardless of the rest, and low tide pins the same way. Otherwise the score is the average of the components, so viable hours range from the excellent color down to the marginal color. The home page is a single table with the days of the week across the top and a row per location. Each cell is that day drawn as one crisp stripe per hour in that hour's color, so scanning a column shows every option for a given day. Click a cell to drill into the hourly detail, where each metric shows a dot in its category's color with the value written out beside it.

All timestamps are Pacific time, hardcoded in the Open-Meteo requests, since every shipped location is on the California coast.

Hour colors come from a four-anchor ramp, one anchor per category, blending linearly in between. The anchors ship in the `colors` key of config.json, so the palette can be retuned without touching code. The default is deep green through light green and gold to red, with a blue-based colorblind-friendly scheme in app settings.

## Data sources

- Wind, weather, and waves: [Open-Meteo](https://open-meteo.com) forecast and marine APIs. Free, no API key. Waves are model data for each location's own coordinates, not a buoy reading, using total significant wave height with the swell and wind-wave split shown in the tooltip.
- Tides: [NOAA Tides & Currents](https://tidesandcurrents.noaa.gov) predictions (MLLW). The station ID is a per-location preference, so different spots can reference different stations.
- Sun times are computed locally using the NOAA solar equations.

## Editing the config

The default filters and the locations everyone sees live in [public/config.json](public/config.json). You can edit that file by hand, but the easier path is the config editor, which reuses the app's own preference controls (including the protected-direction wheels) and puts every launch on a map.

Because a static file server cannot write to disk, the editor is served by a small local server that can. Run it from the repo root, then open the address it prints:

```
node tools/edit-server.mjs
```

That serves the site at [http://localhost:8790/edit.html](http://localhost:8790/edit.html) and nothing else changes on disk until you save. In the editor you drag a marker to move a launch, click the map to add one, delete a spot, set the global default filters, and open any spot to set its own thresholds. Saving overwrites `public/config.json` in your working tree directly, so the workflow is edit, save, `git diff` to review, then commit and push. Each location is stored as only the values that differ from the defaults, so the file stays small and a location keeps inheriting future default changes. The server binds to localhost and is never deployed.

## JSON API

For notification tools and cron jobs, the same forecast logic is exposed as a Cloudflare Pages Function that returns raw JSON instead of rendering UI.

```
POST /api/forecast
{ "name": "Baywood", "lat": 35.34, "lon": -120.83, "days": 3,
  "prefs": { "tide": { "enabled": true, "stationId": "9412110", "minFt": 2.5 } } }
```

A GET form covers the common fields: `/api/forecast?lat=35.34&lon=-120.83&station=9412110&minTide=2.5&waves=1` (`swell=1` still works). The `prefs` object accepts everything the website stores, see [prefs.js](public/js/core/prefs.js) for the schema and [config.json](public/config.json) for the shipped defaults. The response contains each daylight hour's raw values plus its evaluation against the supplied preferences.

## Development

There is no build step. For the static site alone, any file server works:

```
python3 -m http.server -d public 8788
```

To run with the API functions, use Wrangler:

```
npx wrangler pages dev public
```

## Deployment

Deployed on Cloudflare Pages. Connect the repo in the Cloudflare dashboard with no build command and `public` as the output directory (also declared in `wrangler.toml`). The `functions/` directory is picked up automatically.

`public/_headers` marks every file no-cache, so browsers revalidate on each load and a deploy shows up on the next visit without a hard refresh. As a second guard against stale clients, config.json carries a `version` number matched by `APP_VERSION` in `public/js/app.js`. The app fetches config.json fresh on every boot, and if the deployed version is newer than the running code it reloads itself once. When a deploy changes the JS or HTML, bump both numbers together.

## Project structure

- `public/config.json` — the default filters and locations everyone sees. Edit here (or via the config editor).
- `public/edit.html` + `public/js/edit.js` — the map-based config editor.
- `tools/edit-server.mjs` — local server that serves the editor and writes its saves back to `public/config.json`.
- `public/` — the site. `js/core/` holds forecast logic shared with the API, `js/providers/` the data source clients, `js/ui/` the views (`ui/prefsform.js` is the shared preference controls used by both the app and the editor).
- `functions/api/forecast.js` — the JSON endpoint, evaluated with the same config.json defaults.
