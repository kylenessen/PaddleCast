"""Weather data fetching and processing module."""

from typing import Dict, Any
import requests
import pandas as pd
import logging
from datetime import datetime, date
from typing import Dict, Any, Optional


# Configure logging
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')


def get_hourly_forecast() -> Optional[pd.DataFrame]:
    """
    Fetches hourly weather forecast data from the NWS API for a specific gridpoint
    and returns it as a pandas DataFrame.

    Returns:
        Optional[pd.DataFrame]: A DataFrame containing the hourly forecast periods,
                                 or None if an error occurs.
    """
    forecast_url = "https://api.weather.gov/gridpoints/LOX/72,118/forecast/hourly"
    headers = {
        # NWS API requires a User-Agent
        'User-Agent': '(paddlecast, kyle.nessen@gmail.com)',
        'Accept': 'application/geo+json'
    }

    try:
        response = requests.get(
            forecast_url, headers=headers, timeout=15)  # Added timeout
        response.raise_for_status()  # Raises HTTPError for bad responses (4XX or 5XX)

        data = response.json()

        # Extract periods data
        periods = data.get('properties', {}).get('periods')

        if periods is None:
            logging.error(
                "Could not find 'properties.periods' in the API response.")
            return None
        if not isinstance(periods, list):
            logging.error("'properties.periods' is not a list.")
            return None
        if not periods:
            logging.warning("API response contained an empty 'periods' list.")
            return pd.DataFrame()  # Return empty DataFrame for empty list

        # Convert to DataFrame
        df = pd.DataFrame(periods)

        # Optional: Convert startTime and endTime to datetime objects individually
        # This makes them more useful for time-based analysis later
        try:
            df['startTime'] = pd.to_datetime(df['startTime'])
        except Exception as e:
            logging.warning(
                f"Could not convert 'startTime' column to datetime: {e}")
            # Continue without conversion if it fails

        try:
            df['endTime'] = pd.to_datetime(df['endTime'])
        except Exception as e:
            logging.warning(
                f"Could not convert 'endTime' column to datetime: {e}")
            # Continue without conversion if it fails

        logging.info(
            f"Successfully fetched and processed {len(df)} hourly forecast periods.")
        return df

    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching weather data from NWS API: {e}")
        return None
    # Added TypeError for unexpected data structures
    except (KeyError, ValueError, TypeError) as e:
        logging.error(f"Error processing weather data: {e}")
        return None
    except Exception as e:  # Catch any other unexpected errors
        logging.error(f"An unexpected error occurred: {e}")
        return None
