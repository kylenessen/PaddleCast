"""Weather data fetching and processing module."""

from typing import Dict, Any
import requests
import pandas as pd
import logging
from datetime import datetime, date
from typing import Dict, Any, Optional


import os
import requests
import pandas as pd
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

# Configure basic logging to INFO level
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_wu_forecast(
    api_key: str,
    latitude: float,
    longitude: float
) -> Optional[pd.DataFrame]:
    """
    Fetches the 48-hour hourly weather forecast from The Weather Company (Weather Underground) API
    for a specific location.

    Args:
        api_key: Your Weather Underground API key.
        latitude: Latitude of the location.
        longitude: Longitude of the location.

    Returns:
        Optional[pd.DataFrame]: A DataFrame containing the hourly forecast periods,
                                 or None if an error occurs.
                                 The DataFrame includes columns for:
                                 - timestamp (datetime)
                                 - temperature (float)
                                 - wind_speed (float)
                                 - wind_direction (int)
                                 - precip_chance (int)
                                 - condition_icon (int)
                                 - condition_text (str)
    """
    base_url = "https://api.weather.com/v3/wx/forecast/hourly/48hour"
    params = {
        "apiKey": api_key,
        "geocode": f"{latitude},{longitude}",
        "format": "json",
        "units": "e",  # Imperial units (Fahrenheit, mph)
        "language": "en-US"
    }
    headers = {
        'User-Agent': '(paddlecast, kyle.nessen@gmail.com)', # Good practice
        'Accept': 'application/json'
    }

    logging.info(
        f"Requesting WU 48-hour forecast for geocode: {params['geocode']}"
    )

    try:
        response = requests.get(base_url, params=params, headers=headers, timeout=20)
        response.raise_for_status()  # Raise an exception for bad status codes (4xx or 5xx)
        
        raw_response_text = response.text
        logging.info(f"Raw WU API Response:\n{raw_response_text}") # Log raw response

        data = response.json()

        # --- Data Parsing based on TWC/WU API Structure ---
        # The API typically returns a list of hourly forecasts.
        # Field names are based on common TWC API patterns.
        # Top-level response might contain the hourly data directly or under a key.
        # Let's assume the hourly data is a list at the top level or under a known key.
        # Common TWC API hourly forecast fields (adjust if needed based on raw response):
        # validTimeUtc: Array of epoch timestamps for each hour.
        # temp: Array of temperatures.
        # wspd: Array of wind speeds.
        # wdir: Array of wind directions.
        # precipChance: Array of precipitation chances.
        # iconCode: Array of weather icon codes.
        # narrative: Array of short weather descriptions for each hour.
        # It's more common for TWC APIs to return arrays for each field, 
        # rather than a list of dictionaries for each hour.

        num_forecasts = len(data.get('validTimeUtc', []))
        if num_forecasts == 0:
            logging.warning("WU API response contains no forecast periods (e.g., 'validTimeUtc' is empty or missing).")
            return pd.DataFrame() # Return empty DataFrame

        all_forecasts = []
        for i in range(num_forecasts):
            try:
                # Extracting data by index from each array
                timestamp_utc = data.get('validTimeUtc', [])[i]
                temp = data.get('temp', [])[i]
                wind_speed = data.get('wspd', [])[i] # miles per hour
                wind_direction = data.get('wdir', [])[i] # degrees
                precip_chance = data.get('precipChance', [])[i] # percentage
                icon_code = data.get('iconCode', [])[i]
                condition_text = data.get('narrative', [])[i] # Short text description

                # Ensure essential data is present for this specific hour
                if any(val is None for val in [timestamp_utc, temp, wind_speed, wind_direction, precip_chance, icon_code, condition_text]):
                    logging.warning(f"Skipping forecast period index {i} due to missing data.")
                    continue
                
                all_forecasts.append({
                    "timestamp": datetime.fromtimestamp(timestamp_utc), # Convert epoch to datetime
                    "temperature": float(temp),
                    "wind_speed": float(wind_speed),
                    "wind_direction": int(wind_direction),
                    "precip_chance": int(precip_chance),
                    "condition_icon": int(icon_code),
                    "condition_text": str(condition_text),
                })
            except (IndexError, TypeError, ValueError) as e:
                logging.warning(f"Error parsing forecast period index {i}. Data: {data}. Error: {e}")
                continue
        
        if not all_forecasts:
            logging.warning("No valid hourly forecast data could be parsed from the WU response.")
            return pd.DataFrame()

        df = pd.DataFrame(all_forecasts)
        
        if df.empty:
            logging.info("No forecast data available after parsing.")
            return pd.DataFrame()

        logging.info(f"Successfully fetched and processed {len(df)} WU hourly forecast periods.")
        return df

    except requests.exceptions.Timeout:
        logging.error(f"Timeout when requesting WU forecast for {latitude},{longitude}.")
        return None
    except requests.exceptions.HTTPError as e:
        logging.error(
            f"HTTP error {e.response.status_code} for {e.request.url} when requesting WU forecast."
        )
        if e.response.status_code == 401: # Unauthorized
            logging.error("WU API Key is invalid or unauthorized. Please check your API key.")
        # The raw response is already logged if it was received.
        return None
    except requests.exceptions.RequestException as e: # Other request-related errors
        logging.error(f"Error requesting WU forecast: {e}")
        return None
    except (KeyError, ValueError, TypeError) as e: # Errors during JSON parsing or data processing
        logging.error(f"Error processing WU forecast data (JSON parsing or data type issue): {e}. Raw response was logged.")
        return None
    except Exception as e:  # Catch any other unexpected errors
        logging.error(f"An unexpected error occurred in get_wu_forecast: {e}")
        return None

