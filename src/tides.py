"""
Module for fetching and analyzing tide data from NOAA CO-OPS API.
"""
import os
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Union
import requests
import pandas as pd
from zoneinfo import ZoneInfo
from dataclasses import dataclass
import yaml
from astral import LocationInfo
from astral.sun import sun


@dataclass
class TideWindow:
    """Represents a time window with start and end times."""
    start: datetime
    end: datetime

    @property
    def duration_minutes(self) -> float:
        """Calculate duration of window in minutes."""
        return (self.end - self.start).total_seconds() / 60

    def __str__(self) -> str:
        return (f"{self.start.strftime('%I:%M %p')} to {self.end.strftime('%I:%M %p')} "
                f"(duration: {int(self.duration_minutes)} minutes)")

    def clip_to_window(self, start: datetime, end: datetime) -> Optional['TideWindow']:
        """
        Clip this window to fit within the given start and end times.
        Returns None if there's no overlap or the clipped duration is too short.
        """
        if self.end <= start or self.start >= end:
            return None

        clipped_start = max(self.start, start)
        clipped_end = min(self.end, end)
        return TideWindow(clipped_start, clipped_end)


class TidesService:
    """Service for fetching and analyzing tide data."""

    BASE_URL = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"

    def __init__(self, config_path: str = "config.yaml"):
        """
        Initialize the TidesService.

        Args:
            config_path: Relative path to configuration file from this script's directory
        """
        # Construct the absolute path to the config file
        script_dir = os.path.dirname(os.path.abspath(__file__))
        config_path_abs = os.path.join(script_dir, config_path)

        try:
            with open(config_path_abs, 'r') as f:
                config = yaml.safe_load(f)
        except FileNotFoundError:
            raise FileNotFoundError(
                f"Configuration file not found at {config_path_abs}")
        except yaml.YAMLError as e:
            raise ValueError(
                f"Error parsing configuration file {config_path_abs}: {e}")

        self.station_id = config['location']['tide_station_id']
        self.lat = config['location']['lat']
        self.lon = config['location']['lon']
        self.before_sunrise = timedelta(
            minutes=config['time_buffer']['minutes_before_sunrise'])
        self.after_sunset = timedelta(
            minutes=config['time_buffer']['minutes_after_sunset'])
        self.min_duration = config['thresholds']['min_tide_duration_minutes']
        self.tz = ZoneInfo("America/Los_Angeles")

        # Create location info for sun calculations
        self.location = LocationInfo(
            name="Location",
            region="CA",
            latitude=self.lat,
            longitude=self.lon,
            timezone="America/Los_Angeles"
        )

    def get_sun_times(self, date: datetime) -> Tuple[datetime, datetime]:
        """
        Get sunrise and sunset times for the given date, including buffers.

        Args:
            date: The date to get sun times for

        Returns:
            Tuple of (sunrise, sunset) times with buffers applied
        """
        s = sun(self.location.observer, date=date.date())

        # Convert to target date's timezone and ensure correct date
        sunrise = s['sunrise'].astimezone(self.tz)
        sunset = s['sunset'].astimezone(self.tz)

        # Ensure we're using the correct date
        target_date = date.date()
        if sunrise.date() != target_date:
            sunrise = sunrise.replace(
                year=target_date.year,
                month=target_date.month,
                day=target_date.day
            )
        if sunset.date() != target_date:
            sunset = sunset.replace(
                year=target_date.year,
                month=target_date.month,
                day=target_date.day
            )

        # Apply buffers
        sunrise = sunrise - self.before_sunrise
        sunset = sunset + self.after_sunset

        return sunrise, sunset

    def get_predictions(
        self,
        start_date: datetime,
        end_date: datetime,
        datum: str = "MLLW",
        interval: str = "6",  # 6-minute intervals
        units: str = "english",
        time_zone: str = "lst_ldt"
    ) -> List[Dict[str, Union[str, float]]]:
        """
        Get tide predictions for the specified time range.

        Args:
            start_date: Start datetime
            end_date: End datetime
            datum: Vertical datum (default MLLW - Mean Lower Low Water)
            interval: Time interval in minutes ('6', 'h' for hourly, or 'hilo' for highs and lows)
            units: 'english' or 'metric'
            time_zone: Time zone for results ('gmt', 'lst', or 'lst_ldt')

        Returns:
            List of dictionaries containing tide predictions
        """
        params = {
            "station": self.station_id,
            "product": "predictions",
            "datum": datum,
            "units": units,
            "time_zone": time_zone,
            "format": "json",
            "interval": interval,
            "application": "Kayak_Notification_Service",
            "begin_date": start_date.strftime("%Y%m%d %H:%M"),
            "end_date": end_date.strftime("%Y%m%d %H:%M")
        }

        response = requests.get(self.BASE_URL, params=params)
        response.raise_for_status()

        data = response.json()
        if "error" in data:
            raise ValueError(f"API Error: {data['error']['message']}")

        return data.get("predictions", [])

    def find_tide_windows(
        self,
        target_date: datetime,
        min_height: float = 3.0,
        min_duration: int = 90,
        daylight_only: bool = True
    ) -> List[TideWindow]:
        """
        Find continuous time windows where tide height is above minimum threshold
        for at least the specified duration within daylight hours.

        Args:
            target_date: The date to analyze
            min_height: Minimum tide height in feet
            min_duration: Minimum duration in minutes
            daylight_only: If True, only return windows during daylight hours (with buffers)

        Returns:
            List of TideWindow objects representing suitable windows
        """
        # Ensure target_date has timezone
        if target_date.tzinfo is None:
            target_date = target_date.replace(tzinfo=self.tz)

        # Get predictions for the full day
        start_date = target_date.replace(
            hour=0, minute=0, second=0, microsecond=0)
        end_date = start_date + timedelta(days=1)
        tide_data = self.get_predictions(start_date, end_date)

        # Convert tide data to DataFrame for analysis
        df = pd.DataFrame(tide_data)
        # NOAA returns times in local time (LST/LDT), so parse them directly
        df['t'] = pd.to_datetime(df['t'])
        df['v'] = pd.to_numeric(df['v'])

        # Find periods where height is above minimum
        df['above_min'] = df['v'] >= min_height

        # Initialize variables for finding continuous blocks
        windows = []
        current_start = None

        for i in range(len(df)):
            if df['above_min'].iloc[i]:
                if current_start is None:
                    current_start = df['t'].iloc[i]
            elif current_start is not None:
                # End of a block - check duration
                end_time = df['t'].iloc[i-1]
                duration = (end_time - current_start).total_seconds() / 60

                if duration >= min_duration:
                    # Add timezone info when creating windows
                    windows.append(TideWindow(
                        start=current_start.replace(tzinfo=self.tz),
                        end=end_time.replace(tzinfo=self.tz)
                    ))

                current_start = None

        # Check final block if it exists
        if current_start is not None:
            end_time = df['t'].iloc[-1]
            duration = (end_time - current_start).total_seconds() / 60

            if duration >= min_duration:
                # Add timezone info when creating windows
                windows.append(TideWindow(
                    start=current_start.replace(tzinfo=self.tz),
                    end=end_time.replace(tzinfo=self.tz)
                ))

        # Filter for daylight hours if requested
        if daylight_only and windows:
            sunrise, sunset = self.get_sun_times(target_date)
            daylight_windows = []

            for window in windows:
                # Clip the window to daylight hours
                clipped = window.clip_to_window(sunrise, sunset)
                if clipped and clipped.duration_minutes >= min_duration:
                    daylight_windows.append(clipped)

            return daylight_windows

        return windows
