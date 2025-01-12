"""Module for retrieving sunrise and sunset times from sunrise-sunset.org API."""

import requests
from datetime import datetime
import yaml
from typing import Dict, Any
from dataclasses import dataclass

@dataclass
class SunTimes:
    sunrise: datetime
    sunset: datetime
    day_length: str

def load_config() -> Dict[str, Any]:
    """Load configuration from config.yaml."""
    with open('config.yaml', 'r') as f:
        return yaml.safe_load(f)

def get_sun_times(date: str) -> SunTimes:
    """
    Get sunrise and sunset times for the configured location.
    
    Args:
        date: Date in YYYY-MM-DD format
    
    Returns:
        SunTimes object containing sunrise and sunset times
    """
    config = load_config()
    lat = config['location']['lat']
    lon = config['location']['lon']
    
    url = (
        f"https://api.sunrise-sunset.org/json"
        f"?lat={lat}&lng={lon}"
        f"&date={date}"
        f"&tzid=America/Los_Angeles"
        f"&formatted=0"  # Get ISO 8601 time format
    )
    
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    
    if data['status'] != 'OK':
        raise RuntimeError(f"API returned error status: {data}")
    
    results = data['results']
    
    return SunTimes(
        sunrise=datetime.fromisoformat(results['sunrise']),
        sunset=datetime.fromisoformat(results['sunset']),
        day_length=results['day_length']
    )

if __name__ == '__main__':
    # Example usage
    today = datetime.now().strftime('%Y-%m-%d')
    sun_times = get_sun_times(today)
    print(f"Sunrise: {sun_times.sunrise}")
    print(f"Sunset: {sun_times.sunset}")
    print(f"Day length: {sun_times.day_length}")
