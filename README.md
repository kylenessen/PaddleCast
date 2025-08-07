# Paddle Cast

Static site that displays forecasted kayaking windows for Morro Bay, CA.

Quickstart (local):

1. Install deps and generate data

```bash
pip3 install -r requirements.txt
python3 scripts/fetch_and_score.py
```

2. Serve locally

```bash
python3 -m http.server 8000
# Visit http://localhost:8000/src/index.html
```

GitHub Pages

- The `Deploy Frontend` workflow syncs `src/` to the `gh-pages` branch root.
- The `Update Data` workflow runs every 3 hours and writes `data/data.json` into `gh-pages`.
- Configure Pages to serve from the `gh-pages` branch, root.

Configuration

- `MIN_TIDE_FT` and `MIN_DURATION_MIN` can be set via environment variables in the workflow.

