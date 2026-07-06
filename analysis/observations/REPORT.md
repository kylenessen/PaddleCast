# PaddleCast observation study

Analysis of 94 on-the-ground condition ratings logged in Baywood between 2025-08-13 and 2026-07-03. Each submission recorded a moon score (converted to 1 to 5 stars in half-star steps), sky, water, and visibility categories, an optional note, the current reading from the backyard Tempest station, and the matching hourly forecast from Tomorrow.io, Tempest, Open-Meteo, and NWS, plus the nearby COOSDP observation station. 92 of 94 submissions matched a station reading. Reproduce with `uv run analyze.py` in this directory.

Scores skew high. 66 of 94 observations were rated 4 or better, so "would I paddle" is treated as score >= 4 throughout.

## 1. Which provider best predicts current conditions

Wind normalized to mph. Tomorrow.io and both Tempest feeds report m/s, Open-Meteo reports km/h, NWS and COOSDP report mph. Errors are against the Tempest station average wind at submission time. Station readings were fresh, median 30 seconds old.

| Provider | n | MAE (mph) | Bias (mph) | Pearson r | Gust MAE | Gust bias |
|---|---|---|---|---|---|---|
| Open-Meteo | 82 | 2.62 | +2.24 | 0.71 | 4.37 | +3.42 |
| Tempest Forecast | 83 | 2.96 | +2.62 | 0.62 | 4.58 | +4.19 |
| Tomorrow.io | 82 | 3.02 | +2.32 | 0.65 | 4.61 | +3.76 |
| COOSDP (station) | 87 | 3.47 | +2.94 | 0.67 | 3.26 | +2.03 |
| NWS Forecast | 92 | 5.06 | +4.50 | 0.64 | n/a | n/a |

Open-Meteo is the most accurate forecast on every metric. NWS is clearly the worst. It quantizes to 5 mph steps, over-predicts by 4.5 mph on average, and a few pulls returned a stale forecast period hours before the observation.

Every source, including the real COOSDP anemometer nearby, reads higher than the backyard station. The Baywood site appears genuinely sheltered, so the bias is a property of the location, not a provider defect. Any go/no-go threshold learned from the station must be translated upward when applied to forecast values.

A second, more app-relevant ranking is how well each provider's forecast wind predicts the experienced score directly:

| Source | Spearman r vs score | 50% go threshold (mph, in that source's terms) |
|---|---|---|
| Tempest station (reference) | -0.64 | 5.6 |
| COOSDP | -0.51 | 9.6 |
| Tempest Forecast | -0.40 | 9.7 |
| Open-Meteo | -0.36 | 9.1 |
| NWS Forecast | -0.34 | 13.7 |
| Tomorrow.io | -0.28 | 10.4 |

No forecast comes close to the station itself. The nearby COOSDP live observation is the best proxy after the backyard Tempest, which argues for weighting live observations heavily for "conditions right now" and using forecasts only for the future hours they are actually needed for.

## 2. What drives the score

Wind dominates, exactly as suspected. Spearman correlations with score, using station variables measured at the moment of observation:

| Variable | Spearman r | p |
|---|---|---|
| Wind gust | -0.64 | <0.001 |
| Wind avg | -0.64 | <0.001 |
| Wind lull | -0.61 | <0.001 |
| UV / solar / brightness | -0.23 to -0.26 | ~0.02 |
| Humidity, dew point | -0.10 | n.s. |
| Air temperature | -0.02 | n.s. |

Average wind alone explains 44% of score variance. Gusts add nothing once average wind is known, they move together at this site. The weak negative solar correlation is a confound, sunny afternoons are windy afternoons.

The second real factor is fog. Adding fog flags to wind lifts explained variance from 44% to 60%. Every single "calm but rated badly" outlier in the dataset is a fog day. Dense fog days average 2.75 even in light wind, versus 4.6 to 4.8 for sunny or partly cloudy calm days. Temperature never matters. Notably, "Partly Cloudy" is the best-rated sky (4.61), beating full sun (4.02), though at equal low wind they tie, so sky state mostly matters through fog.

The waterConditions category tracks the score almost perfectly (Glass 4.71, Textured 3.97, Rippled 3.91, Choppy 2.60, Whitecaps 1.70) and maps cleanly onto station wind. Glass appears at a median of 1.3 mph, Rippled at 3.6, Textured at 4.9, Choppy at 6.8, Whitecaps at 7.6 mph average with 12 mph gusts.

## 3. Preference thresholds and the Beaufort scale

Logistic fit on station wind gives a 50% go probability at 5.6 mph average (8.5 mph gust). The go probability is 87% at 2 mph, 70% at 4 mph, 45% at 6 mph, 22% at 8 mph, and under 10% by 10 mph. The windiest conditions ever rated 4+ were 7.2 mph average and 11.4 mph gusts.

On the Beaufort scale, using station average wind converted to knots:

| Beaufort force | n | Mean score | Rated 4+ |
|---|---|---|---|
| 0 Calm (<1 kt) | 16 | 4.66 | 88% |
| 1 Light air (1-3 kt) | 44 | 4.19 | 84% |
| 2 Light breeze (4-6 kt) | 29 | 3.40 | 45% |
| 3 Gentle breeze (7-10 kt) | 3 | 1.33 | 0% |

The preference is simply Beaufort 0 to 1. Force 2 is a coin flip, and force 3 has never been acceptable. Caveat, the station is sheltered, so in open-water Beaufort terms (which is what forecasts approximate) the tolerance ceiling sits around force 2 to low 3, consistent with the ~9 to 10 mph forecast-space thresholds above.

## 4. Implications for app design

The scoring model should be wind-first with a fog penalty and nothing else. Temperature, humidity, and pressure earn no weight for this location. Gusts can be dropped or kept as a tiebreaker, they add no information beyond average wind at this site.

Thresholds must live in the source's own units. Against the backyard station, green is roughly under 4 mph, marginal 4 to 7, red above 7. Against forecast values the same experience sits near 9 to 10 mph (Open-Meteo, Tempest, Tomorrow.io) and about 14 mph for NWS. A per-provider bias correction of roughly -2 to -3 mph (-4.5 for NWS) would let one threshold serve all sources.

Provider choice is confirmed. Preferring Tempest wind (already implemented) is right for nowcasting, and Open-Meteo is the best pure forecast to fill future hours. NWS hourly wind adds little here. Fog is worth forecasting; cloud cover and visibility fields from Open-Meteo or Tomorrow.io could drive the fog penalty.

## 5. Has the wind tolerance shifted over time

Splitting at Nov 2025 (69 observations before, 23 after), the overall logistic threshold barely moves (5.8 to 6.1 mph) and wind-adjusted score residuals show no time trend. But the middle band did shift. In the 2 to 6 mph no-fog band, early observations average 4.15 with several 2.0 and 3.5 ratings, while late observations average 4.62 and never dip below 4.0 (Mann-Whitney p = 0.03, small n). The early period never awarded 5.0 above 3.6 mph station wind. The late period gave a 5.0 at 5.1 mph (2026-07-03, rippled, evening). The June 2026 note states the mechanism directly, "Actually paddling now and the quality of being outside overcomes the imperfect water surface conditions," echoed by the Aug 2025 "Actual paddle. Pretty good but fighting wind" scoring above trend. Ratings made while actually on the water run higher than shore ratings of the same conditions.

The ceiling has not moved. Every late observation at 7 mph or above (four of them, 7.2 to 11.2 mph, choppy or whitecaps) scored 3.0 or worse. So the recent data argues for widening the green band upward through roughly rippled/textured water (about 5 to 6 mph station wind) while keeping the red line near 7 mph. Two caveats, the late sample is small and contains zero fog days, and the marginal-band evidence rests on a handful of observations, two of which were made mid-paddle.

Caveats. Sample covers roughly one year but is concentrated in mornings (52 of 92 observations between 7 and 10 am), high-wind exposure is thin (only 3 observations above 8 mph), and scores are one person's taste, which is precisely the point of PaddleCast.
