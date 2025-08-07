# Paddle Cast

Paddle Cast is a lightweight, zero-backend web app that highlights the best upcoming kayaking windows for Morro Bay, California.

- Live site: [paddlecast.org](https://paddlecast.org)
- Source: [github.com/kylenessen/PaddleCast](https://github.com/kylenessen/PaddleCast)

### What it does
- Pulls NOAA tides and NWS hourly weather forecasts
- Scores conditions and surfaces paddling windows (duration, tide height, wind, fog/rain considerations)
- Renders simple charts and at‑a‑glance cards for each day
- Updates automatically throughout the day via GitHub Actions

### How it works
- A scheduled workflow fetches and scores data, writing a single `data/data.json` file
- The static frontend (`src/`) fetches that JSON and renders the UI client‑side
- Everything is served on GitHub Pages (no servers or databases)

### Data sources
- NOAA Tides & Currents predictions (MLLW)
- National Weather Service hourly forecast (wind, temperature, short forecast)

### Scoring at a glance
- Minimum tide threshold and minimum window duration
- Wind, fog/visibility, rain, and time‑of‑day adjustments
- Final score shown as stars with an intuitive color scale

### Project structure
- `src/`: Static site (HTML/CSS/JS)
- `scripts/fetch_and_score.py`: Data retrieval and scoring
- `data/data.json`: Latest generated dataset (also published to Pages)
- `SPEC.md`: Technical details of the MVP and workflows

### Notes
- Frontend deploys automatically from `main` to the `gh-pages` branch
- Data refresh runs on a schedule and writes into `gh-pages/data/data.json`

For deeper technical details or to contribute, see `SPEC.md` and the Python script in `scripts/`.
