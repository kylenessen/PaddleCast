"""Tests for the tides module."""
import pytest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch, Mock
from src.tides import TidesService, TideWindow

@pytest.fixture
def tide_service():
    """Create a TidesService instance for testing."""
    return TidesService()  

@pytest.fixture
def sample_predictions():
    """Sample tide prediction data for testing."""
    tz = ZoneInfo("America/Los_Angeles")
    base_time = datetime(2025, 1, 1, 0, 0, tzinfo=tz)  # Start at midnight
    
    # Generate 24 hours of data with 30-minute intervals
    data = []
    current_time = base_time
    for hour in range(24):
        # Early morning (midnight to 6 AM) - below threshold
        if hour < 6:
            height = 2.5
        # Morning window (6 AM to 10 AM)
        elif hour < 10:
            height = 3.5
        # Mid-day (10 AM to 2 PM) - below threshold
        elif hour < 14:
            height = 2.5
        # Afternoon window (2 PM to 6 PM)
        elif hour < 18:
            height = 3.5
        # Evening (6 PM to midnight) - below threshold
        else:
            height = 2.5
            
        # Add two data points per hour (30-minute intervals)
        data.append({
            "t": current_time.strftime("%Y-%m-%d %H:%M"),
            "v": height
        })
        current_time += timedelta(minutes=30)
        data.append({
            "t": current_time.strftime("%Y-%m-%d %H:%M"),
            "v": height
        })
        current_time += timedelta(minutes=30)
    
    return data

def test_tide_window_duration():
    """Test TideWindow duration calculation."""
    tz = ZoneInfo("America/Los_Angeles")
    start = datetime(2025, 1, 1, 10, 0, tzinfo=tz)
    end = datetime(2025, 1, 1, 11, 30, tzinfo=tz)
    window = TideWindow(start, end)
    assert window.duration_minutes == 90

def test_tide_window_str():
    """Test TideWindow string representation."""
    tz = ZoneInfo("America/Los_Angeles")
    start = datetime(2025, 1, 1, 10, 0, tzinfo=tz)
    end = datetime(2025, 1, 1, 11, 30, tzinfo=tz)
    window = TideWindow(start, end)
    expected = "10:00 AM to 11:30 AM (duration: 90 minutes)"
    assert str(window) == expected

@patch('requests.get')
def test_get_predictions(mock_get, tide_service):
    """Test fetching tide predictions."""
    mock_response = Mock()
    mock_response.json.return_value = {
        "predictions": [{"t": "2025-01-01 10:00", "v": "3.2"}]
    }
    mock_get.return_value = mock_response

    predictions = tide_service.get_predictions(
        datetime(2025, 1, 1),
        datetime(2025, 1, 2)
    )

    assert len(predictions) == 1
    assert predictions[0]["t"] == "2025-01-01 10:00"
    assert predictions[0]["v"] == "3.2"

    # Verify API call parameters
    mock_get.assert_called_once()
    args = mock_get.call_args
    assert args[1]["params"]["product"] == "predictions"

@patch('requests.get')
def test_find_tide_windows(mock_get, tide_service, sample_predictions):
    """Test finding tide windows."""
    mock_response = Mock()
    mock_response.json.return_value = {"predictions": sample_predictions}
    mock_get.return_value = mock_response

    tz = ZoneInfo("America/Los_Angeles")
    target_date = datetime(2025, 1, 1, tzinfo=tz)
    
    # Test without daylight restrictions
    windows = tide_service.find_tide_windows(
        target_date,
        min_height=3.0,
        min_duration=90
    )
    
    assert len(windows) == 2
    assert all(isinstance(w, TideWindow) for w in windows)
    assert all(w.duration_minutes >= 90 for w in windows)

    # Test with daylight restrictions
    sunrise = datetime(2025, 1, 1, 7, 0, tzinfo=tz)
    sunset = datetime(2025, 1, 1, 17, 0, tzinfo=tz)
    windows = tide_service.find_tide_windows(
        target_date,
        min_height=3.0,
        min_duration=90,
        daylight_only=True
    )
    
    assert len(windows) == 2
    assert all(sunrise <= w.start <= sunset for w in windows)
    assert all(sunrise <= w.end <= sunset for w in windows)

@patch('requests.get')
def test_api_error_handling(mock_get, tide_service):
    """Test handling of API errors."""
    mock_response = Mock()
    mock_response.json.return_value = {
        "error": {"message": "Invalid station ID"}
    }
    mock_get.return_value = mock_response

    with pytest.raises(ValueError, match="API Error: Invalid station ID"):
        tide_service.get_predictions(
            datetime(2025, 1, 1),
            datetime(2025, 1, 2)
        )

if __name__ == "__main__":
    """
    Simple script to check tide windows for a specific date.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from src.tides import TidesService

    # Initialize service with config
    tides = TidesService()
    
    # Set up target date
    tz = ZoneInfo("America/Los_Angeles")
    target_date = datetime(2025, 1, 11, tzinfo=tz)
    
    # Get sun times for information
    sunrise, sunset = tides.get_sun_times(target_date)
    print(f"\nChecking tide windows for {target_date.date()}")
    print(f"Daylight hours (including buffers):")
    print(f"  Sunrise: {sunrise.strftime('%I:%M %p')} ({sunrise})")
    print(f"  Sunset:  {sunset.strftime('%I:%M %p')} ({sunset})")
    
    # First get all windows
    all_windows = tides.find_tide_windows(
        target_date,
        min_height=3.0,
        min_duration=90,
        daylight_only=False
    )
    
    print("\nAll tide windows:")
    for window in all_windows:
        print(f"- {window}")
        print(f"  start: {window.start}")
        print(f"  end: {window.end}")
    
    # Then get daylight windows
    windows = tides.find_tide_windows(
        target_date,
        min_height=3.0,
        min_duration=90,
        daylight_only=True
    )
    
    if not windows:
        print("\nNo suitable windows found during daylight hours")
    else:
        print(f"\nFound {len(windows)} suitable windows during daylight hours:")
        for window in windows:
            print(f"- {window}")
            print(f"  start: {window.start}")
            print(f"  end: {window.end}")
            
    # Show additional windows
    if len(all_windows) > len(windows):
        print(f"\nAdditional windows outside daylight hours:")
        for window in all_windows:
            if window not in windows:
                print(f"- {window}")
                print(f"  start: {window.start}")
                print(f"  end: {window.end}")
