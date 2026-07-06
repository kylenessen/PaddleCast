# Condition filters (draft spec)

Encodes what the observation study (see `analysis/observations/REPORT.md`) and ocean
kayak-fishing guidance tell us about turning forecast/observation data into a
go / marginal / no-go rating. Two location archetypes, because the physics differ.

## Core principle

Rate on what the paddler will actually feel on the water, not on a single headline
number. For sheltered bays that means wind. For exposed ocean launches it means the
**total** sea state (swell + wind waves + period), of which the forecast "swell
height" is only one part. The June 21 Cambria trip failed at only ~3 ft swell because
1.7 ft of wind chop and a 22 mph onshore gust rode on top of it.

## Archetype A — sheltered bay (e.g. Baywood)

Wind-first, single dominant driver (wind explains ~44% of score alone, ~60% with fog).
Gusts add no information beyond average wind here; temperature/humidity/pressure add none.

Thresholds depend on the data source because the Baywood site is sheltered and every
forecast/remote source over-reads it by ~2-3 mph (NWS by ~4.5). Store the band edges
per source, or apply a bias correction and use one set.

| Rating | Station (Tempest) avg wind | Forecast-space avg wind |
|---|---|---|
| Good (green) | < 4 mph | < 6-7 mph |
| Marginal (yellow) | 4-7 mph | 7-10 mph |
| No-go (red) | > 7 mph | > 10 mph (> ~14 for NWS) |

Fog penalty: knock the rating down when fog is present (dense fog caps observed
scores near 2.75 even in dead calm). Drive this from cloud/visibility fields
(Open-Meteo, Tomorrow.io).

Recency note: recent data supports widening green up through rippled/textured water
(~5-6 mph station) while keeping the red line at ~7 mph. On-water ratings run higher
than shore ratings of the same conditions.

Source priority for "now": live station (Tempest) > nearby live obs (COOSDP) >
forecasts. Use Open-Meteo as the best pure forecast to fill future hours.

## Archetype B — exposed ocean launch (e.g. Leffingwell Landing, Cambria)

Needs three marine inputs the bay logic ignores, all free from Open-Meteo's marine API:
**total wave height**, **wind-wave height**, and **swell period**. Rate on the worst
of the wind rule and the sea-state rule.

| Rating | Total wave height | Swell period | Wind-wave height | Wind |
|---|---|---|---|---|
| Good | ≤ 3 ft | ≥ 12 s | < 1 ft | < 8-10 mph |
| Marginal | 3-4 ft | 8-12 s | 1-1.5 ft | 10-15 mph |
| No-go | > 4 ft | < 8 s | > 1.5 ft | > 15 mph |

Period rule of thumb: swell period (s) should be at least double the wave height (ft).
3 ft at 12+ s is rolling and manageable; 3 ft at 7 s is steep and dangerous. Encode
`period >= 2 * total_wave_height_ft` as a comfort gate that can pull an otherwise-green
day down.

Onshore wind onto the landing produces shore pound and makes the return worse than the
launch, so weight the launch-window wind for the *end* of the planned session, not just
the start. Central-coast pattern is near-calm mornings with the onshore ramping to a
mid-afternoon peak, so favor early launches.

## Beaufort reference (paddler tolerance, sheltered-bay observations)

- Force 0-1: good (84-88% rated 4+).
- Force 2: marginal / tolerable (~45% go).
- Force 3+: no-go (0 for 3 in the data).

Because the bay under-reads, the same experience shows as ~force 3 in open-water /
forecast terms. On exposed water use the sea-state table above, not Beaufort alone.
