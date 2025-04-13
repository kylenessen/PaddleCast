import pytest
import requests
import requests_mock
import pandas as pd
from src.weather import get_hourly_forecast
from datetime import datetime

# Sample valid API response structure based on user's example and NWS format
SAMPLE_VALID_RESPONSE = {
    "properties": {
        "periods": [
            {
                "number": 1,
                "name": "",
                "startTime": "2025-04-12T22:00:00-07:00",
                "endTime": "2025-04-12T23:00:00-07:00",
                "isDaytime": False,
                "temperature": 48,
                "temperatureUnit": "F",
                "temperatureTrend": None,  # Use None for null JSON values
                "probabilityOfPrecipitation": {"unitCode": "wmoUnit:percent", "value": 1},
                "dewpoint": {"unitCode": "wmoUnit:degC", "value": 8.88888888888889},
                "relativeHumidity": {"unitCode": "wmoUnit:percent", "value": 100},
                "windSpeed": "10 mph",
                "windDirection": "WNW",
                "icon": "https://api.weather.gov/icons/land/night/few?size=small",
                "shortForecast": "Mostly Clear",
                "detailedForecast": ""
            },
            {
                "number": 2,
                "name": "",
                "startTime": "2025-04-12T23:00:00-07:00",
                "endTime": "2025-04-13T00:00:00-07:00",
                "isDaytime": False,
                "temperature": 47,
                "temperatureUnit": "F",
                "temperatureTrend": "falling",
                "probabilityOfPrecipitation": {"unitCode": "wmoUnit:percent", "value": 2},
                "dewpoint": {"unitCode": "wmoUnit:degC", "value": 8.333333333333334},
                "relativeHumidity": {"unitCode": "wmoUnit:percent", "value": 99},
                "windSpeed": "9 mph",
                "windDirection": "NW",
                "icon": "https://api.weather.gov/icons/land/night/few?size=small",
                "shortForecast": "Mostly Clear",
                "detailedForecast": ""
            }
        ]
    }
}

# The URL used in the function
FORECAST_URL = "https://api.weather.gov/gridpoints/LOX/72,118/forecast/hourly"


def test_get_hourly_forecast_success(requests_mock):
    """Test successful API call and DataFrame creation."""
    requests_mock.get(
        FORECAST_URL, json=SAMPLE_VALID_RESPONSE, status_code=200)
    df = get_hourly_forecast()

    assert isinstance(df, pd.DataFrame)
    assert not df.empty
    assert len(df) == 2
    assert 'startTime' in df.columns
    assert 'temperature' in df.columns
    assert pd.api.types.is_datetime64_any_dtype(df['startTime'])
    assert pd.api.types.is_datetime64_any_dtype(df['endTime'])
    assert df.iloc[0]['temperature'] == 48


def test_get_hourly_forecast_network_error(requests_mock, caplog):
    """Test handling of network errors."""
    requests_mock.get(
        FORECAST_URL, exc=requests.exceptions.ConnectionError("Network error"))
    df = get_hourly_forecast()

    assert df is None
    assert "Error fetching weather data" in caplog.text
    assert "Network error" in caplog.text


def test_get_hourly_forecast_http_error(requests_mock, caplog):
    """Test handling of HTTP errors (e.g., 404 Not Found)."""
    requests_mock.get(FORECAST_URL, status_code=404, reason="Not Found")
    df = get_hourly_forecast()

    assert df is None
    assert "Error fetching weather data" in caplog.text
    # requests raises this specific message
    assert "404 Client Error: Not Found" in caplog.text


def test_get_hourly_forecast_missing_properties_key(requests_mock, caplog):
    """Test handling of response missing the 'properties' key."""
    malformed_response = {"some_other_key": "value"}
    requests_mock.get(FORECAST_URL, json=malformed_response, status_code=200)
    df = get_hourly_forecast()

    assert df is None
    assert "Could not find 'properties.periods'" in caplog.text


def test_get_hourly_forecast_missing_periods_key(requests_mock, caplog):
    """Test handling of response missing the 'periods' key within 'properties'."""
    malformed_response = {"properties": {"some_other_key": "value"}}
    requests_mock.get(FORECAST_URL, json=malformed_response, status_code=200)
    df = get_hourly_forecast()

    assert df is None
    assert "Could not find 'properties.periods'" in caplog.text


def test_get_hourly_forecast_periods_not_a_list(requests_mock, caplog):
    """Test handling of response where 'periods' is not a list."""
    malformed_response = {"properties": {"periods": "this is not a list"}}
    requests_mock.get(FORECAST_URL, json=malformed_response, status_code=200)
    df = get_hourly_forecast()

    assert df is None
    assert "'properties.periods' is not a list" in caplog.text


def test_get_hourly_forecast_empty_periods_list(requests_mock, caplog):
    """Test handling of response with an empty 'periods' list."""
    empty_periods_response = {"properties": {"periods": []}}
    requests_mock.get(
        FORECAST_URL, json=empty_periods_response, status_code=200)
    df = get_hourly_forecast()

    assert isinstance(df, pd.DataFrame)
    assert df.empty
    assert "API response contained an empty 'periods' list" in caplog.text


def test_get_hourly_forecast_invalid_datetime_format(requests_mock, caplog):
    """Test handling when datetime conversion fails for startTime/endTime."""
    response_with_bad_date = {
        "properties": {
            "periods": [
                {
                    "number": 1, "startTime": "invalid-date-format", "endTime": "2025-04-12T23:00:00-07:00",
                    "temperature": 48, "temperatureUnit": "F", "windSpeed": "10 mph", "shortForecast": "Clear"
                    # Add other required fields minimally if needed by DataFrame creation
                }
            ]
        }
    }
    requests_mock.get(
        FORECAST_URL, json=response_with_bad_date, status_code=200)
    df = get_hourly_forecast()

    assert isinstance(df, pd.DataFrame)
    assert not df.empty
    # Check that the column exists but wasn't converted
    assert pd.api.types.is_object_dtype(df['startTime'])
    assert df.iloc[0]['startTime'] == "invalid-date-format"
    # Check that the other column *was* converted
    assert pd.api.types.is_datetime64_any_dtype(df['endTime'])
    # Check that the specific warning for startTime was logged
    assert "Could not convert 'startTime' column to datetime" in caplog.text
