import pandas as pd
import logging
from src.weather import get_hourly_forecast

# Configure logging to see potential warnings/errors from the function
logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

print("Attempting to fetch live hourly forecast data from NWS API...")

# Call the function
hourly_df = get_hourly_forecast()

# Check the result and print
if hourly_df is not None:
    if not hourly_df.empty:
        print("\nSuccessfully retrieved hourly forecast data:")
        # Configure pandas to display more rows/columns if needed
        pd.set_option('display.max_rows', None)
        pd.set_option('display.max_columns', None)
        pd.set_option('display.width', 1000)
        print(hourly_df)
    else:
        print("\nSuccessfully connected to API, but received an empty forecast list.")
else:
    print("\nFailed to retrieve hourly forecast data. Check logs for errors.")
