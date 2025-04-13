"""Test script for the COOPS API client."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from coops_api import COOPSAPIClient
import yaml

def load_config():
    """Load configuration from config.yaml."""
    with open("config.yaml", "r") as f:
        return yaml.safe_load(f)

def main():
    # Load config
    config = load_config()
    station_id = config["location"]["tide_station_id"]
    
    # Initialize client
    client = COOPSAPIClient(station_id)
    
    # Get current time in Pacific timezone
    now = datetime.now(ZoneInfo("America/Los_Angeles"))
    tomorrow = now + timedelta(days=1)
    
    # Get water levels for the last 24 hours
    print("\nWater Levels (Last 24 hours):")
    water_levels = client.get_water_levels()
    for level in water_levels[-5:]:  # Show last 5 readings
        print(f"Time: {level['t']}, Level: {level['v']} ft")
    
    # Get predictions for tomorrow
    print("\nPredictions for Tomorrow:")
    predictions = client.get_predictions(
        start_date=tomorrow.replace(hour=0, minute=0),
        end_date=tomorrow.replace(hour=23, minute=59),
        interval="hilo"  # Get only high and low tides
    )
    for pred in predictions:
        print(f"Time: {pred['t']}, Level: {pred['v']} ft, Type: {'High' if pred['type'] == 'H' else 'Low'} Tide")

if __name__ == "__main__":
    main()
