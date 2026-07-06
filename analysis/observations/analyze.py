# /// script
# requires-python = ">=3.12"
# dependencies = ["pandas", "openpyxl", "scipy", "scikit-learn", "matplotlib"]
# ///
"""Analysis of on-the-ground PaddleCast observations (Baywood).

Reads "PaddleCast Observations.xlsx" (n8n form scores + provider pulls at
submission time) and produces the tables behind analysis/observations/REPORT.md
plus the charts in analysis/observations/charts/.

Run with: uv run analyze.py
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.linear_model import LinearRegression, LogisticRegression

HERE = Path(__file__).parent
XLSX = HERE / "PaddleCast Observations.xlsx"
CHARTS = HERE / "charts"
CHARTS.mkdir(exist_ok=True)

MS2MPH = 2.23694
KMH2MPH = 0.621371
MS2KT = 1.94384

S = pd.read_excel(XLSX, sheet_name=None)

# ---- form: moon emoji score -> numeric 1..5 in 0.5 steps ----
form = S["n8n Form"].copy()
form["score"] = form["score"].map(lambda s: s.count("\U0001f315") + 0.5 * s.count("\U0001f317"))
form["go"] = (form["score"] >= 4).astype(int)
form["fog"] = form["conditions"].str.contains("Fog").astype(int)
form["dense_fog"] = (form["conditions"].str.contains("Dense Fog")).astype(int)

# ---- station truth: Tempest observations (m/s -> mph) ----
obs = S["Tempest Observations"].copy()
for c in ["wind_avg", "wind_gust", "wind_lull"]:
    obs[c + "_mph"] = obs[c] * MS2MPH

m = form.merge(obs, on="submittedAt", how="inner")


# ---- provider wind normalized to mph, with forecast valid time ----
def provider(name: str) -> pd.DataFrame:
    df = S[name].copy()
    if name == "Tomorrow.io":
        df["fc_mph"] = df["windSpeed"] * MS2MPH
        df["fcg_mph"] = df["windGust"] * MS2MPH
        df["valid"] = pd.to_datetime(df["time"], utc=True)
    elif name == "Tempest Forecast":
        df["fc_mph"] = df["wind_avg"] * MS2MPH
        df["fcg_mph"] = df["wind_gust"] * MS2MPH
        df["valid"] = pd.to_datetime(df["time_iso"], utc=True)
    elif name == "Open-Meteo":
        df["fc_mph"] = df["wind_speed_10m"] * KMH2MPH
        df["fcg_mph"] = df["wind_gusts_10m"] * KMH2MPH
        df["valid"] = pd.to_datetime(df["time"], utc=True)
    elif name == "NWS Forecast":
        df["fc_mph"] = df["windSpeed"].astype(str).str.extract(r"(\d+)").astype(float).iloc[:, 0]
        df["fcg_mph"] = np.nan
        df["valid"] = pd.to_datetime(df["startTime"], utc=True)
    elif name == "COOSDP":
        df["fc_mph"] = df["wind_speed_mph"]
        df["fcg_mph"] = df["wind_gust_mph"]
        df["valid"] = pd.to_datetime(df["time"], utc=True)
    df["stale_hr"] = (pd.to_datetime(df["submittedAt"], utc=True) - df["valid"]).dt.total_seconds() / 3600
    return df[["submittedAt", "fc_mph", "fcg_mph", "stale_hr"]]


PROVIDERS = ["Tempest Forecast", "Tomorrow.io", "Open-Meteo", "NWS Forecast", "COOSDP"]

# ================= 1. provider accuracy vs station =================
truth = obs[["submittedAt", "wind_avg_mph", "wind_gust_mph"]]
rows = []
for name in PROVIDERS:
    j = provider(name).merge(truth, on="submittedAt").dropna(subset=["fc_mph", "wind_avg_mph"])
    err = j["fc_mph"] - j["wind_avg_mph"]
    jg = j.dropna(subset=["fcg_mph", "wind_gust_mph"])
    gerr = jg["fcg_mph"] - jg["wind_gust_mph"] if len(jg) else pd.Series(dtype=float)
    rows.append(
        {
            "provider": name,
            "n": len(j),
            "MAE": err.abs().mean(),
            "bias": err.mean(),
            "RMSE": np.sqrt((err**2).mean()),
            "pearson": stats.pearsonr(j["fc_mph"], j["wind_avg_mph"]).statistic,
            "spearman": stats.spearmanr(j["fc_mph"], j["wind_avg_mph"]).statistic,
            "gust_MAE": gerr.abs().mean() if len(gerr) else np.nan,
            "gust_bias": gerr.mean() if len(gerr) else np.nan,
        }
    )
acc = pd.DataFrame(rows)
print("\n=== Provider wind vs Tempest station (mph) ===")
print(acc.round(2).to_string(index=False))

# ================= 2. what drives the score =================
feats = [
    "wind_avg_mph",
    "wind_gust_mph",
    "wind_lull_mph",
    "uv",
    "solar_radiation",
    "brightness",
    "relative_humidity",
    "dew_point",
    "air_temperature",
]
rows = [
    {
        "feature": f,
        "spearman": stats.spearmanr(m[f], m["score"]).statistic,
        "p": stats.spearmanr(m[f], m["score"]).pvalue,
    }
    for f in feats
]
print("\n=== Spearman correlation with score (station variables) ===")
print(pd.DataFrame(rows).round(3).to_string(index=False))

for cols in [["wind_avg_mph"], ["wind_avg_mph", "fog", "dense_fog"]]:
    r2 = LinearRegression().fit(m[cols], m["score"]).score(m[cols], m["score"])
    print(f"R2 {cols}: {r2:.2f}")

print("\n=== Score by form category ===")
for col in ["waterConditions", "visibility", "conditions"]:
    print(m.groupby(col)["score"].agg(["count", "mean"]).round(2).sort_values("mean", ascending=False).to_string())
    print()

# ================= 3. thresholds and Beaufort =================
for var in ["wind_avg_mph", "wind_gust_mph"]:
    lr = LogisticRegression().fit(m[[var]], m["go"])
    thr = -lr.intercept_[0] / lr.coef_[0, 0]
    print(f"P(score>=4)=50% at {var} = {thr:.1f} mph")

m["kt"] = m["wind_avg"] * MS2KT
edges = [0, 1, 4, 7, 11, 17]
labels = ["B0 calm (<1 kt)", "B1 light air (1-3)", "B2 light breeze (4-6)", "B3 gentle breeze (7-10)", "B4 moderate (11-16)"]
m["beaufort"] = pd.cut(m["kt"], edges, labels=labels, right=False)
bft = m.groupby("beaufort", observed=True)["score"].agg(["count", "mean", lambda s: (s >= 4).mean()])
bft.columns = ["count", "mean_score", "frac_go"]
print("\n=== Score by Beaufort force (station avg wind) ===")
print(bft.round(2).to_string())

# ================= 4. which forecast best predicts the score =================
rows = []
for name in PROVIDERS:
    j = form.merge(provider(name), on="submittedAt").dropna(subset=["fc_mph", "score"])
    lr = LogisticRegression().fit(j[["fc_mph"]], j["go"])
    rows.append(
        {
            "provider": name,
            "n": len(j),
            "spearman_vs_score": stats.spearmanr(j["fc_mph"], j["score"]).statistic,
            "go_threshold_mph": -lr.intercept_[0] / lr.coef_[0, 0],
        }
    )
pred = pd.DataFrame(rows)
print("\n=== Provider forecast wind vs experienced score ===")
print(pred.round(2).to_string(index=False))

# ================= charts =================
plt.rcParams.update({"figure.dpi": 150, "axes.spines.top": False, "axes.spines.right": False})

fig, ax = plt.subplots(figsize=(7, 4.5))
jitter = np.random.default_rng(0).uniform(-0.06, 0.06, len(m))
colors = np.where(m["dense_fog"] == 1, "#d62728", np.where(m["fog"] == 1, "#ff7f0e", "#1f77b4"))
ax.scatter(m["wind_avg_mph"], m["score"] + jitter, c=colors, alpha=0.75, s=28)
ax.axvline(5.6, ls="--", c="gray", lw=1)
ax.text(5.75, 1.1, "50% go/no-go\n5.6 mph", fontsize=8, color="gray")
ax.set_xlabel("Station wind avg (mph)")
ax.set_ylabel("Observed score (moons)")
ax.set_title("Score vs station wind (red = dense fog, orange = other fog)")
fig.tight_layout()
fig.savefig(CHARTS / "score_vs_wind.png")

fig, ax = plt.subplots(figsize=(7, 4))
x = np.arange(len(acc))
ax.bar(x - 0.2, acc["MAE"], 0.4, label="MAE (mph)", color="#1f77b4")
ax.bar(x + 0.2, acc["bias"], 0.4, label="Bias (mph)", color="#ff7f0e")
ax.set_xticks(x, acc["provider"], rotation=15, fontsize=8)
ax.set_ylabel("mph vs Tempest station")
ax.set_title("Provider wind error vs backyard station")
ax.legend()
fig.tight_layout()
fig.savefig(CHARTS / "provider_error.png")

fig, ax = plt.subplots(figsize=(6.5, 4))
ax.bar(bft.index.astype(str), bft["frac_go"], color="#2ca02c")
for i, (n, f) in enumerate(zip(bft["count"], bft["frac_go"])):
    ax.text(i, f + 0.02, f"n={n}", ha="center", fontsize=8)
ax.set_ylabel("Fraction rated 4+ moons")
ax.set_title("Go rate by Beaufort force (station wind)")
ax.set_ylim(0, 1.05)
plt.setp(ax.get_xticklabels(), rotation=12, fontsize=8)
fig.tight_layout()
fig.savefig(CHARTS / "beaufort_go_rate.png")

print(f"\nCharts written to {CHARTS}")
