# Paddle Cast – MVP Technical Specification

**Version:** 1.0  
**Author:** ChatGPT (OpenAI)  
**Date:** 2025-08-07

---

## 1. Overview

Paddle Cast is a **static web app** that displays forecasted kayaking conditions for Morro Bay, CA, based on **tide** and **weather** data.  

The MVP will:
- Retrieve NOAA tide predictions & weather forecasts for the next 7 days.
- Score and highlight optimal paddling windows.
- Update data on a scheduled basis (via GitHub Actions).
- Host the site via **GitHub Pages** with no live backend.

No user accounts or notifications in MVP.

---

## 2. Architecture

**Type:**  
Static site generated from scheduled GitHub Actions.

**High-level Flow:**
```
GitHub Actions (Schedule: every 3 hours)
   ↓
Python Script
   - Fetch tide predictions
   - Fetch weather forecast
   - Merge & score data
   - Output structured JSON
   - Commit to `gh-pages` branch under `/data/data.json`
   ↓
Static Frontend
   - HTML/CSS/JS (hosted on GitHub Pages)
   - Fetch `data.json` for display
   - Render tide charts + windows
```

---

## 3. Data Sources

### 3.1 NOAA Tides & Currents API
**Endpoint format:**
```
https://api.tidesandcurrents.noaa.gov/api/prod/datagetter
?product=predictions
&begin_date=YYYYMMDD
&end_date=YYYYMMDD
&datum=MLLW
&station=9412110
&time_zone=lst_ldt
&units=english
&interval=15
&format=json
```

**Key Params:**
- `station`: `9412110` (Port San Luis, CA)
- `interval`: `15` minutes
- **Response Fields:** `t` (timestamp), `v` (predicted height in feet)

---

### 3.2 NOAA/NWS Weather API
**Step 1:** Get Gridpoint metadata for Morro Bay:  
```
GET https://api.weather.gov/points/{LAT},{LON}
```
Example: `35.365, -120.851`.

**Step 2:** Use returned `gridX/gridY` to get forecast:  
```
GET https://api.weather.gov/gridpoints/{OFFICE}/{gridX},{gridY}/forecast/hourly
```

**Useful Fields:**
- `windSpeed` (in mph)
- `temperature` (°F)
- `shortForecast` (fog/clear/rain detection)
- (Optional) `probabilityOfPrecipitation`

For **live sea conditions**:
```
https://www.ndbc.noaa.gov/data/realtime2/pslc1.txt
```
(PSLC1 buoy).

---

## 4. Scoring Logic (MVP)

### Gating Conditions:
- Tide height must be >= `MIN_TIDE_FT` (default: 2.5 ft)  
- Period must last at least `MIN_DURATION_MIN` (default: 60 minutes)

### Weather Score Components:
| Factor       | Condition                  | Score Impact |
|--------------|----------------------------|--------------|
| Wind speed   | 0 → +1 star boost           | Ideal        |
|              | 1–5 mph → +0.5 star         | Good         |
|              | 6–10 mph → no change        | Marginal     |
|              | >10 mph → score=0           | Unsuitable   |
| Fog/visibility | "Fog" or vis<1mi → 0 score | Kill score   |
| Rain         | Any POP>0% → -1 star        | Penalty      |
| Temp         | 70°F ideal                  | No penalty   |
|              | <55°F → -0.5 to -1 star     | Penalty      |

### Sunset Bonus:
- If window overlaps within 45 min before sunset → +0.5 star.

**Final display:**  
Continuous score → rounded to nearest 0.5 star (1–5 range).

---

## 5. Data Output

`data/data.json`
```json
{
  "generated_at": "2025-08-07T18:00:00Z",
  "location": "Morro Bay Estuary",
  "settings": {
    "min_tide_ft": 2.5,
    "min_duration_min": 60
  },
  "days": [
    {
      "date": "2025-08-08",
      "windows": [
        {
          "start": "2025-08-08T15:15:00-07:00",
          "end": "2025-08-08T17:00:00-07:00",
          "avg_tide_ft": 3.2,
          "avg_wind_mph": 4,
          "conditions": "Sunny, light winds",
          "score": 4.5
        }
      ]
    }
  ]
}
```

---

## 6. Frontend Features (MVP)

- Chart tide curve per day (Chart.js or D3.js).
- Highlight scored windows on chart.
- Display:
  - Sunrise/sunset marks
  - Moon phase (optional library)
- Responsive for mobile

---

## 7. File/Dir Structure

```
paddlecast/
├── data/
│   └── data.json        # Generated output
├── src/
│   ├── index.html
│   ├── style.css
│   ├── app.js           # Fetches & renders data.json
│   └── charts.js
├── scripts/
│   └── fetch_and_score.py
├── .github/
│   └── workflows/
│       └── update-data.yml
├── package.json         # (optional if using npm libs locally)
└── SPEC.md
```

---

## 8. GitHub Actions Workflow

`.github/workflows/update-data.yml`
```yaml
name: Update Data

on:
  schedule:
    - cron: "0 */3 * * *"  # every 3 hours
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.11"
      - name: Install dependencies
        run: pip install requests pytz
      - name: Run fetch_and_score.py
        run: python scripts/fetch_and_score.py
      - name: Commit and push
        run: |
          git config --global user.name "github-actions[bot]"
          git config --global user.email "github-actions[bot]@users.noreply.github.com"
          git add data/data.json
          git commit -m "Update data [skip ci]" || echo "No changes"
          git push
```

---

## 9. Security Considerations

- NOAA APIs don’t require keys. If using a key-required weather API in future, store in GitHub Actions secrets.
- Never expose personal info; no authentication in MVP.

---

## 10. Roadmap (Post-MVP)

- User adjustable thresholds stored in localStorage
- Notifications (serverless push or email)
- Alternate locations
- More nuanced scoring algorithm

---

**End of SPEC**