# Repository Guidelines

## Project Structure & Modules
- `src/`: Static frontend (HTML/CSS/JS). Entry: `src/index.html`; logic in `src/app.js`, charts in `src/charts.js`, styles in `src/style.css`.
- `scripts/`: Data pipeline (`scripts/fetch_and_score.py`) that fetches NOAA/NWS data and writes `data/data.json`.
- `data/`: Generated artifacts; primary output is `data/data.json`.
- `.github/workflows/update-data.yml`: Hourly GitHub Actions workflow builds `_site/` and deploys to Pages.

## Build, Test, and Dev Commands
- Create env and deps: `python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
- Generate data: `python scripts/fetch_and_score.py` (env vars: `MIN_TIDE_FT`, `MIN_DURATION_MIN`, `WINDOW_BLOCK_MIN`).
- Local preview: from repo root, `python -m http.server 8000` then open `http://localhost:8000/src/`.
- Pages build (CI mirrors this): copies `src/` to `_site/`, then copies `data/data.json` to `_site/data/data.json`.

## Coding Style & Naming
- JavaScript/CSS: 2‑space indent, single quotes, trailing semicolons; keep files lowercase (e.g., `app.js`, `style.css`).
- Python: PEP 8, 4‑space indent, type hints where practical (script targets Python 3.11).
- Naming: descriptive, lowercase for assets and modules; prefer `kebab-case` for new static assets.

## Testing Guidelines
- No formal test suite. Validate by:
  - Running the script and confirming `data/data.json` structure includes `days`, `tide_points`, and `windows`.
  - Loading the site locally to verify charts render and windows align with daylight.
  - Checking the Actions run for hourly builds and artifact contents.

## Commit & Pull Request Guidelines
- Commit style: concise, imperative; use scopes when helpful (e.g., `ci:`, `fix:`, `feat:`). Group related changes.
- PRs: include summary, linked issues, before/after screenshots for UI tweaks, and notes on any env/CI changes. Keep diffs focused.

## Security & Configuration Tips
- No secrets required. External APIs use public endpoints; include a clear `User-Agent` when adding calls.
- Be mindful of API rate limits; cache or batch requests in `scripts/` if expanding sources.
- CI env knobs live in the workflow and script env vars listed above.
