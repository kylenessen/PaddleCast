"""
Fetch tide and weather data for Morro Bay, CA, score paddling windows,
and write structured JSON to data/data.json.

Data sources:
- NOAA Tides & Currents predictions (Port San Luis 9412110)
- Tempest Weather forecast (preferred - most accurate)
- NWS hourly forecast (fallback via points -> gridpoints endpoints)
- Sunrise/sunset times (MET Norway API)

Scoring algorithm updated 2025-09 based on empirical analysis of 49 real-world
observations. Key finding: wind < 2.2 mph is critical for 5-star conditions.
Tempest forecasts are 30% more accurate overall and 8x better for wind vs Open-Meteo.

This script is designed to run in GitHub Actions (ubuntu-latest, Python 3.11)
with only 'requests' and 'pytz' installed.
"""

from __future__ import annotations

import json
import math
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Dict, List, Optional, Tuple

import pytz
import requests


# ----------------------------
# Configuration
# ----------------------------
TIMEZONE_NAME = "America/Los_Angeles"
LOCAL_TZ = pytz.timezone(TIMEZONE_NAME)

LOCATION_NAME = "Morro Bay Estuary"
LAT = 35.365
LON = -120.851

STATION_ID = "9412110"  # Port San Luis, CA
TIDE_INTERVAL_MIN = 15

MIN_TIDE_FT = float(os.getenv("MIN_TIDE_FT", "2.5"))
MIN_DURATION_MIN = int(os.getenv("MIN_DURATION_MIN", "60"))

DAYS_AHEAD = 7
WINDOW_BLOCK_MIN = int(os.getenv("WINDOW_BLOCK_MIN", "120"))

# ----------------------------
# Scoring Configuration
# Based on empirical analysis of 49 observations (Aug-Sep 2025)
# ----------------------------

# Wind thresholds (mph) - CRITICAL for accurate scoring
# Analysis: 5-star avg = 1.6 mph, 4-star avg = 4.0 mph, 2-star avg = 5.1 mph
WIND_EXCELLENT_MPH = 2.2  # < 1.0 m/s - calm, ideal for 5-star
WIND_GOOD_MPH = 3.4       # < 1.5 m/s - good, 4-star territory
WIND_FAIR_MPH = 5.6       # < 2.5 m/s - acceptable, 3-star territory
WIND_MAX_MPH = 10.0       # > 4.5 m/s - unsafe, score = 0

# Wind gust thresholds (mph)
# Analysis: 5-star avg = 3.2 mph, 4-star avg = 6.0 mph
GUST_MAX_MPH = 11.0       # > 5 m/s - dangerous
GUST_HIGH_MPH = 6.7       # > 3 m/s - uncomfortable
GUST_MODERATE_MPH = 4.5   # > 2 m/s - noticeable impact

# Temperature preferences (°F)
# Analysis: 5-star avg = 62°F, range 60-64°F
TEMP_IDEAL_MIN_F = 60
TEMP_IDEAL_MAX_F = 65
TEMP_COLD_F = 50


# ----------------------------
# Helpers
# ----------------------------


def to_local(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return LOCAL_TZ.localize(dt)
    return dt.astimezone(LOCAL_TZ)


def to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_noaa_local_ts(ts: str) -> datetime:
    # NOAA returns e.g. "2025-08-07 15:15" in local time when time_zone=lst_ldt
    naive = datetime.strptime(ts, "%Y-%m-%d %H:%M")
    return LOCAL_TZ.localize(naive)


def parse_iso(dt_str: str) -> datetime:
    # Handles 'Z' by replacing with '+00:00'
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    return datetime.fromisoformat(dt_str)


def daterange(start_date: datetime, days: int) -> List[datetime]:
    return [start_date + timedelta(days=i) for i in range(days)]


def clamp(value: float, min_v: float, max_v: float) -> float:
    return max(min_v, min(max_v, value))


def round_half(value: float) -> float:
    return round(value * 2) / 2.0


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


# ----------------------------
# Fetchers
# ----------------------------


def fetch_tide_predictions(start_local_date: datetime, end_local_date: datetime) -> List[Tuple[datetime, float]]:
    begin_date = start_local_date.strftime("%Y%m%d")
    end_date = end_local_date.strftime("%Y%m%d")
    url = (
        "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
        f"?product=predictions&begin_date={begin_date}&end_date={end_date}"
        f"&datum=MLLW&station={STATION_ID}&time_zone=lst_ldt&units=english"
        f"&interval={TIDE_INTERVAL_MIN}&format=json"
    )
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    predictions = data.get("predictions", [])
    out: List[Tuple[datetime, float]] = []
    for p in predictions:
        t_local = parse_noaa_local_ts(p["t"])  # localized
        v = float(p["v"])  # feet
        out.append((t_local, v))
    return out


def fetch_nws_hourly() -> Dict[datetime, dict]:
    # Get gridpoint metadata
    points_url = f"https://api.weather.gov/points/{LAT},{LON}"
    r = requests.get(points_url, timeout=30, headers={"User-Agent": "paddlecast/1.0 (github)"})
    r.raise_for_status()
    props = r.json()["properties"]
    office = props["gridId"]
    grid_x = props["gridX"]
    grid_y = props["gridY"]

    hourly_url = f"https://api.weather.gov/gridpoints/{office}/{grid_x},{grid_y}/forecast/hourly"
    r2 = requests.get(hourly_url, timeout=30, headers={"User-Agent": "paddlecast/1.0 (github)"})
    r2.raise_for_status()
    periods = r2.json()["properties"]["periods"]

    out: Dict[datetime, dict] = {}
    for p in periods:
        start = parse_iso(p["startTime"])  # timezone-aware
        # Normalize to local for alignment
        start_local = to_local(start)
        wind_mph = parse_wind_speed(p.get("windSpeed", ""))
        pop = None
        pop_obj = p.get("probabilityOfPrecipitation") or {}
        if isinstance(pop_obj, dict):
            pop = pop_obj.get("value")
        entry = {
            "wind_mph": wind_mph if wind_mph is not None else 0.0,
            "wind_gust_mph": 0.0,  # NWS hourly doesn't provide gusts, default to 0
            "temperature_f": p.get("temperature"),
            "shortForecast": p.get("shortForecast", ""),
            "pop_percent": pop if pop is not None else 0.0,
        }
        out[start_local.replace(minute=0, second=0, microsecond=0)] = entry
    return out


def fetch_tempest_hourly() -> Dict[datetime, dict]:
    """
    Fetch hourly forecast from Tempest Weather (WeatherFlow).
    Requires TEMPEST_TOKEN and TEMPEST_STATION_ID environment variables.

    Most accurate forecast source per empirical analysis (MAE: 1.75 overall).
    Wind predictions are especially accurate (0.77 m/s MAE vs 6.45 for Open-Meteo).
    """
    token = os.getenv("TEMPEST_TOKEN")
    station_id = os.getenv("TEMPEST_STATION_ID")

    if not token or not station_id:
        print("⚠️  Tempest credentials not found. Set TEMPEST_TOKEN and TEMPEST_STATION_ID.")
        print("   Falling back to NWS forecast (less accurate for wind).")
        return {}

    url = f"https://swd.weatherflow.com/swd/rest/better_forecast?station_id={station_id}&token={token}"

    try:
        r = requests.get(url, timeout=30, headers={"User-Agent": "paddlecast/1.0 (github)"})
        r.raise_for_status()
        data = r.json()

        out: Dict[datetime, dict] = {}
        hourly_forecasts = data.get("forecast", {}).get("hourly", [])

        for forecast in hourly_forecasts:
            time_epoch = forecast.get("time")
            if not time_epoch:
                continue

            # Convert epoch to local datetime
            dt_utc = datetime.fromtimestamp(time_epoch, tz=timezone.utc)
            dt_local = to_local(dt_utc)
            dt_local = dt_local.replace(minute=0, second=0, microsecond=0)

            # Extract weather data
            # Tempest returns: m/s for wind, °C for temp
            wind_ms = forecast.get("wind_avg", 0)
            gust_ms = forecast.get("wind_gust", 0)
            temp_c = forecast.get("air_temperature", 18)
            conditions = forecast.get("conditions", "")
            precip_prob = forecast.get("precip_probability", 0)

            # Convert to imperial units for consistency with NWS
            out[dt_local] = {
                "wind_mph": wind_ms * 2.237,  # m/s to mph
                "wind_gust_mph": gust_ms * 2.237,  # m/s to mph
                "temperature_f": temp_c * 9/5 + 32,  # C to F
                "shortForecast": conditions,
                "pop_percent": precip_prob,
            }

        print(f"✓ Fetched Tempest forecast: {len(out)} hourly periods")
        return out

    except requests.RequestException as e:
        print(f"⚠️  Tempest API error: {e}")
        print("   Falling back to NWS forecast.")
        return {}


def parse_wind_speed(text: str) -> Optional[float]:
    # Examples: "5 mph", "10 to 15 mph"
    if not text:
        return None
    nums = [int(n) for n in text.replace("mph", "").replace("to", " ").replace("-", " ").split() if n.isdigit()]
    if not nums:
        return None
    return mean(nums)


def _format_offset(dt: datetime) -> str:
    off = dt.utcoffset() or timedelta(0)
    total_min = int(off.total_seconds() // 60)
    sign = '+' if total_min >= 0 else '-'
    total_min = abs(total_min)
    hh = total_min // 60
    mm = total_min % 60
    return f"{sign}{hh:02d}:{mm:02d}"


def fetch_astronomy_range(start_day_local: datetime, end_day_local: datetime) -> Dict[str, dict]:
    """
    Fetch sunrise/sunset and moonrise/moonset + moon phase per day using
    MET Norway Sunrise API (no key, requires UA). Returns mapping by YYYY-MM-DD
    with local-time ISO strings. Moon phase normalized to 0..1 (0=new, 0.5=full).
    """
    out: Dict[str, dict] = {}
    headers = {"User-Agent": "paddlecast/1.0 (github.com/kylenessen/PaddleCast)"}
    num_days = (end_day_local - start_day_local).days
    for day_dt in daterange(start_day_local, num_days):
        date_key = day_dt.strftime("%Y-%m-%d")
        off = _format_offset(day_dt)
        # SUN
        sun_url = (
            f"https://api.met.no/weatherapi/sunrise/3.0/sun?lat={LAT}&lon={LON}&date={date_key}&offset={off}"
        )
        sunrise_iso: Optional[str] = None
        sunset_iso: Optional[str] = None
        try:
            rs = requests.get(sun_url, timeout=30, headers=headers)
            rs.raise_for_status()
            js = rs.json()
            props = js.get("properties", {})
            sr = props.get("sunrise", {})
            ss = props.get("sunset", {})
            sunrise_iso = sr.get("time") if isinstance(sr, dict) else None
            sunset_iso = ss.get("time") if isinstance(ss, dict) else None
        except Exception:
            # Fallback for sunrise/sunset
            sr_f, ss_f = fetch_sun_times_legacy(day_dt)
            sunrise_iso = sr_f.isoformat() if sr_f else None
            sunset_iso = ss_f.isoformat() if ss_f else None

        # MOON
        moon_url = (
            f"https://api.met.no/weatherapi/sunrise/3.0/moon?lat={LAT}&lon={LON}&date={date_key}&offset={off}"
        )
        moonrise_iso: Optional[str] = None
        moonset_iso: Optional[str] = None
        moon_phase_norm: Optional[float] = None
        try:
            rm = requests.get(moon_url, timeout=30, headers=headers)
            rm.raise_for_status()
            jm = rm.json()
            props_m = jm.get("properties", {})
            mr = props_m.get("moonrise", {})
            ms = props_m.get("moonset", {})
            moonrise_iso = mr.get("time") if isinstance(mr, dict) else None
            moonset_iso = ms.get("time") if isinstance(ms, dict) else None
            # MET returns moonphase degrees (0=new, 180=full). Normalize to [0,1].
            phase_deg = props_m.get("moonphase")
            if isinstance(phase_deg, (int, float)):
                moon_phase_norm = (float(phase_deg) % 360.0) / 360.0
        except Exception:
            pass

        out[date_key] = {
            "sunrise": sunrise_iso,
            "sunset": sunset_iso,
            "moonrise": moonrise_iso,
            "moonset": moonset_iso,
            "moon_phase": moon_phase_norm,
        }
    return out


def fetch_sun_times_legacy(day_local: datetime) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Legacy fallback to sunrise-sunset.org for sunrise/sunset only."""
    date_str = day_local.strftime("%Y-%m-%d")
    url = f"https://api.sunrise-sunset.org/json?lat={LAT}&lng={LON}&date={date_str}&formatted=0"
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        res = r.json().get("results", {})
        sr = parse_iso(res.get("sunrise")) if res.get("sunrise") else None
        ss = parse_iso(res.get("sunset")) if res.get("sunset") else None
        return (to_local(sr) if sr else None, to_local(ss) if ss else None)
    except Exception:
        return (None, None)


# ----------------------------
# Scoring
# ----------------------------


def find_windows(tide_points: List[Tuple[datetime, float]]) -> List[Tuple[datetime, datetime, List[Tuple[datetime, float]]]]:
    windows: List[Tuple[datetime, datetime, List[Tuple[datetime, float]]]] = []
    current: List[Tuple[datetime, float]] = []

    def commit_if_valid(seq: List[Tuple[datetime, float]]):
        if len(seq) < 2:
            return
        start = seq[0][0]
        end = seq[-1][0]
        duration_min = (end - start).total_seconds() / 60.0
        if duration_min >= MIN_DURATION_MIN:
            windows.append((start, end, seq.copy()))

    for (t, h) in tide_points:
        if h >= MIN_TIDE_FT:
            if not current:
                current = [(t, h)]
            else:
                current.append((t, h))
        else:
            if current:
                commit_if_valid(current)
                current = []
    if current:
        commit_if_valid(current)

    return windows


def window_weather_stats(start: datetime, end: datetime, hourly: Dict[datetime, dict]) -> Tuple[float, float, float, List[str], List[float], List[float]]:
    # Aggregate overlapping hourly entries
    # Returns: (avg_wind, avg_wind_gust, avg_temp, forecasts, temps, pops)
    cur = start.replace(minute=0, second=0, microsecond=0)
    end_hour = end.replace(minute=0, second=0, microsecond=0)
    winds: List[float] = []
    gusts: List[float] = []
    temps: List[float] = []
    pops: List[float] = []
    forecasts: List[str] = []

    while cur <= end_hour:
        info = hourly.get(cur)
        if info:
            winds.append(float(info.get("wind_mph", 0.0)))
            gusts.append(float(info.get("wind_gust_mph", 0.0)))
            t = info.get("temperature_f")
            if t is not None:
                temps.append(float(t))
            p = info.get("pop_percent")
            if p is not None:
                pops.append(float(p))
            forecasts.append(info.get("shortForecast", ""))
        cur += timedelta(hours=1)

    avg_wind = mean(winds) if winds else 0.0
    avg_wind_gust = mean(gusts) if gusts else 0.0
    avg_temp = mean(temps) if temps else 65.0
    return avg_wind, avg_wind_gust, avg_temp, forecasts, temps, pops


def _has_dense_fog(forecasts: List[str]) -> bool:
    for f in forecasts:
        text = (f or "").lower().strip()
        if not text:
            continue
        if "dense fog" in text:
            return True
        if "widespread fog" in text:
            return True
        if text == "fog":
            return True
    return False


def score_window(avg_wind: float, avg_temp: float, forecasts: List[str], pops: List[float], start: datetime, end: datetime, sunset: Optional[datetime], avg_wind_gust: Optional[float] = None) -> float:
    # Base score
    score = 3.0

    # Wind component - UPDATED based on empirical analysis
    # Analysis showed: 5-star avg = 1.6 mph, 4-star avg = 4.0 mph, 2-star avg = 5.1 mph
    if avg_wind > 10:  # Unsafe conditions
        return 0.0
    elif avg_wind >= 5.6:  # Choppy, uncomfortable (2-star territory)
        score += 0.3
    elif avg_wind >= 3.4:  # Acceptable but not ideal (3-star territory)
        score += 0.8
    elif avg_wind >= 2.2:  # Good conditions (4-star territory)
        score += 1.2
    else:  # < 2.2 mph - Calm, ideal for 5-star
        score += 2.0

    # Wind gust penalty - gusts above 4.5 mph significantly degrade experience
    if avg_wind_gust is not None:
        if avg_wind_gust > 11.0:  # > 5 m/s - dangerous
            return 0.0
        elif avg_wind_gust > 6.7:  # > 3 m/s - uncomfortable
            score -= 0.5
        elif avg_wind_gust > 4.5:  # > 2 m/s - noticeable impact
            score -= 0.3

    # Fog rule: only kill for dense/widespread fog; "Patchy Fog" does NOT penalize
    if _has_dense_fog(forecasts):
        return 0.0

    # Rain penalty (any PoP > 0)
    if any((p or 0) > 0 for p in pops):
        score -= 1.0

    # Temperature penalty
    if avg_temp < 50:
        score -= 1.0
    elif avg_temp < 55:
        score -= 0.5

    # Sunset bonus: overlaps within 45 min before sunset
    if sunset is not None:
        bonus_start = sunset - timedelta(minutes=45)
        if end >= bonus_start and start <= sunset:
            score += 0.5

    return clamp(round_half(score), 1.0, 5.0)


def summarize_conditions(forecasts: List[str], avg_wind: float) -> str:
    label = ""
    # Choose the most frequent shortForecast keyword
    texts = [f for f in forecasts if f]
    if texts:
        # Pick the shortest representative string
        label = min(texts, key=len)
    wind_text = (
        "calm winds" if avg_wind < 1
        else "light winds" if avg_wind < 6
        else "breezy"
    )
    return f"{label or 'Clear'}, {wind_text}"


# ----------------------------
# Main
# ----------------------------


def build():
    now_utc = datetime.now(timezone.utc)
    now_local = to_local(now_utc)
    start_day = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_day = start_day + timedelta(days=DAYS_AHEAD)

    # Fetch
    tide_pts = fetch_tide_predictions(start_day, end_day)

    # Try Tempest first (most accurate), fallback to NWS
    hourly = fetch_tempest_hourly()
    if not hourly:
        hourly = fetch_nws_hourly()

    astronomy_map = fetch_astronomy_range(start_day, end_day)
    forecasts_seen = sorted({
        (info.get("shortForecast") or "").strip()
        for info in hourly.values()
        if (info.get("shortForecast") or "").strip()
    })

    # Group tides by local date
    tides_by_day: Dict[str, List[Tuple[datetime, float]]] = defaultdict(list)
    for t, h in tide_pts:
        date_key = t.strftime("%Y-%m-%d")
        tides_by_day[date_key].append((t, h))

    # Sort points per day
    for k in tides_by_day.keys():
        tides_by_day[k].sort(key=lambda x: x[0])

    days_out = []
    for day_dt in daterange(start_day, DAYS_AHEAD):
        date_key = day_dt.strftime("%Y-%m-%d")
        points = tides_by_day.get(date_key, [])
        astro = astronomy_map.get(date_key, {})
        sr_iso = astro.get("sunrise")
        ss_iso = astro.get("sunset")
        mr_iso = astro.get("moonrise")
        ms_iso = astro.get("moonset")
        phase_val = astro.get("moon_phase")
        if not points:
            # Day stub with available astronomy
            days_out.append({
                "date": date_key,
                "sunrise": sr_iso,
                "sunset": ss_iso,
                "moonrise": mr_iso,
                "moonset": ms_iso,
                "moon_phase": phase_val,
                "tide_points": [],
                "windows": [],
            })
            continue

        windows = find_windows(points)
        windows_out = []

        # Split into fixed-size blocks for clearer scoring/visualization
        for (w_start, w_end, w_pts) in windows:
            cursor = w_start
            while cursor < w_end:
                seg_end = min(cursor + timedelta(minutes=WINDOW_BLOCK_MIN), w_end)
                # Points within this segment
                seg_pts = [(t, h) for (t, h) in w_pts if cursor <= t <= seg_end]
                avg_tide = mean([h for (_t, h) in seg_pts]) if seg_pts else 0.0
                avg_wind, avg_wind_gust, avg_temp, forecasts, temps, pops = window_weather_stats(cursor, seg_end, hourly)
                # Use sunset time for bonus if available
                sunset_dt = parse_iso(ss_iso) if ss_iso else None
                score = score_window(avg_wind, avg_temp, forecasts, pops, cursor, seg_end, sunset_dt, avg_wind_gust)
                windows_out.append({
                    "start": cursor.isoformat(),
                    "end": seg_end.isoformat(),
                    "avg_tide_ft": round(avg_tide, 2),
                    "avg_wind_mph": round(avg_wind, 1),
                    "avg_wind_gust_mph": round(avg_wind_gust, 1),
                    "conditions": summarize_conditions(forecasts, avg_wind),
                    "score": score,
                })
                cursor = seg_end

        tide_points_out = [
            {"time": t.isoformat(), "height_ft": round(h, 2)} for (t, h) in points
        ]

        days_out.append({
            "date": date_key,
            "sunrise": sr_iso,
            "sunset": ss_iso,
            "moonrise": mr_iso,
            "moonset": ms_iso,
            "moon_phase": phase_val,
            "tide_points": tide_points_out,
            "windows": windows_out,
        })

    output = {
        "generated_at": to_utc_iso(now_local),
        "location": LOCATION_NAME,
        "settings": {
            "min_tide_ft": MIN_TIDE_FT,
            "min_duration_min": MIN_DURATION_MIN,
        },
        "nws_short_forecasts_seen": forecasts_seen,
        "days": days_out,
    }

    ensure_dir(os.path.join(os.getcwd(), "data"))
    out_path = os.path.join(os.getcwd(), "data", "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    build()


