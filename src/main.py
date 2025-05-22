import os
import sys
import logging
from datetime import datetime, timedelta
import pytz # For timezone handling
import pandas as pd # For weather data manipulation
from dotenv import load_dotenv

# Custom module imports
# Assuming they are in the same directory or PYTHONPATH is set up appropriately
import config # For load_config, load_rubric
from tides import TidesService, TideWindow # Assuming TideWindow is also exposed or used internally
from weather import get_wu_forecast
from llm_handler import get_llm_forecast
from notifications import NotificationService

# --- Basic Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout) # Log to stdout
        # Optionally, add logging.FileHandler("paddlecast.log") to log to a file
    ]
)
logger = logging.getLogger("PaddleCastMain")

def main():
    """
    Main function to orchestrate the kayak forecasting and notification process.
    """
    logger.info("Starting PaddleCast application...")

    # --- 1. Setup and Configuration Loading ---
    load_dotenv()
    logger.info("Environment variables loaded.")

    try:
        app_config = config.load_config("config.yaml")
        rubric_string = config.load_rubric("rubric.md")
        if app_config is None:
            logger.error("Failed to load config.yaml. Exiting.")
            sys.exit(1)
        if rubric_string is None:
            logger.error("Failed to load rubric.md. Exiting.")
            sys.exit(1)
        logger.info("Application configuration and LLM rubric loaded successfully.")
    except FileNotFoundError as e:
        logger.error(f"Configuration or rubric file not found: {e}. Ensure 'config.yaml' and 'rubric.md' are in the 'src' directory or accessible.", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error loading initial configuration or rubric: {e}", exc_info=True)
        sys.exit(1)

    # Retrieve API keys
    pushover_user_key = os.getenv("PUSHOVER_USER_KEY")
    pushover_app_token = os.getenv("PUSHOVER_APP_TOKEN")
    wu_api_key = os.getenv("WU_API_KEY")
    openai_api_key = os.getenv("OPENAI_API_KEY") # Assuming OpenAI for now

    if not all([pushover_user_key, pushover_app_token]):
        logger.warning("Pushover user key or app token not found in environment. Notifications will be disabled.")
        # Continue without Pushover, but log it. Actual notification sending will handle this.

    # WU and OpenAI keys will be checked before their respective API calls.

    # --- 2. Determine Target Date and Timezone ---
    try:
        local_tz_name = app_config.get("location", {}).get("timezone", "America/Los_Angeles")
        local_tz = pytz.timezone(local_tz_name)
    except pytz.exceptions.UnknownTimeZoneError:
        logger.error(f"Invalid timezone specified in config: {local_tz_name}. Exiting.")
        sys.exit(1)
    
    now_local = datetime.now(local_tz)
    today_local = now_local.date() # Not used directly in forecast, but good for reference
    tomorrow_local = (now_local + timedelta(days=1)).date()
    logger.info(f"Local timezone: {local_tz_name}. Target date for forecast: {tomorrow_local}")

    # --- 3. Initialize Services ---
    try:
        # Assuming config.yaml is in 'src/' relative to where this script might be run from,
        # or an absolute path is handled by TidesService if config_path is relative from its own location.
        # For simplicity, TidesService might need to adjust its path logic if main.py is not in src/.
        # Let's assume TidesService expects config_path relative to its own file.
        tide_service = TidesService(config_path="config.yaml")
        logger.info("TidesService initialized.")
        
        notification_service = NotificationService(
            user_key=pushover_user_key,
            app_token=pushover_app_token
        )
        logger.info("NotificationService initialized.")
        if not notification_service.is_configured():
            logger.warning("NotificationService is not fully configured due to missing Pushover keys. Notifications will not be sent.")

    except FileNotFoundError as e: # Specifically for config file issues in services
        logger.error(f"Configuration file not found during service initialization (e.g., TidesService's config): {e}", exc_info=True)
        sys.exit(1)
    except ValueError as e: # E.g. YAML parsing error within TidesService
        logger.error(f"ValueError during service initialization (likely config parsing): {e}", exc_info=True)
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error initializing services: {e}", exc_info=True)
        sys.exit(1)

    # --- 4. Fetch Tide Windows ---
    initial_tide_windows: list[TideWindow] = []
    try:
        min_tide_height = app_config.get("thresholds", {}).get("min_tide_height_ft", 3.0)
        min_tide_duration = app_config.get("thresholds", {}).get("min_tide_duration_minutes", 90)
        
        tomorrow_datetime_local = datetime.combine(tomorrow_local, datetime.min.time(), tzinfo=local_tz)

        initial_tide_windows = tide_service.find_tide_windows(
            target_date=tomorrow_datetime_local,
            min_height=float(min_tide_height),
            min_duration=int(min_tide_duration),
            daylight_only=True 
        )
        logger.info(f"Found {len(initial_tide_windows)} initial tide windows for {tomorrow_local.strftime('%Y-%m-%d')}.")
    except Exception as e:
        logger.error(f"Error fetching tide windows: {e}", exc_info=True)
        # If tide data is critical and fails, we might want to exit or send a specific error notification.
        # For now, we'll let it proceed, and llm_forecast_text will reflect no windows.
        initial_tide_windows = [] # Ensure it's empty on failure


    # --- 5. Filter Windows by Weather Conditions ---
    suitable_kayaking_windows = []
    llm_forecast_text = "" # Will be populated based on outcomes

    if not initial_tide_windows:
        logger.info("No initial tide windows to filter. Proceeding to generate summary based on this.")
        llm_forecast_text = f"No suitable tide windows found for {tomorrow_local.strftime('%A, %B %d')} before weather analysis."
    elif not wu_api_key:
        logger.error("Weather Underground API key (WU_API_KEY) not found. Cannot perform weather filtering.")
        llm_forecast_text = "Weather forecast could not be retrieved: WU_API_KEY is missing. Please set this environment variable."
    else:
        try:
            logger.info(f"Fetching 48-hour weather forecast from WU for lat: {app_config['location']['lat']}, lon: {app_config['location']['lon']}")
            weather_forecast_df = get_wu_forecast(
                api_key=wu_api_key,
                latitude=app_config['location']['lat'],
                longitude=app_config['location']['lon']
            )

            if weather_forecast_df is None:
                logger.warning("get_wu_forecast returned None. Skipping weather filtering.")
                llm_forecast_text = "Weather forecast data is currently unavailable (API returned no data). Cannot determine suitable windows."
            elif weather_forecast_df.empty:
                logger.warning("Retrieved empty weather forecast DataFrame. No weather data to process.")
                llm_forecast_text = "No hourly weather forecast data was returned by the WU API. Cannot determine suitable windows."
            else:
                weather_forecast_df['timestamp'] = pd.to_datetime(weather_forecast_df['timestamp']).dt.tz_localize('UTC')
                logger.info(f"Successfully fetched {len(weather_forecast_df)} hourly WU forecasts.")

                for tide_window in initial_tide_windows:
                    logger.debug(f"Processing tide window: {tide_window.start.strftime('%H:%M %Z')} to {tide_window.end.strftime('%H:%M %Z')}")
                    window_start_utc = tide_window.start.astimezone(pytz.utc)
                    window_end_utc = tide_window.end.astimezone(pytz.utc)
                    
                    window_weather_df = weather_forecast_df[
                        (weather_forecast_df['timestamp'] >= window_start_utc) &
                        (weather_forecast_df['timestamp'] <= window_end_utc)
                    ].copy()

                    if window_weather_df.empty:
                        logger.info(f"No specific WU weather data for window: {tide_window.start.strftime('%H:%M')}-{tide_window.end.strftime('%H:%M')}")
                        continue
                    
                    cols_to_numeric = ['wind_speed', 'temperature', 'precip_chance']
                    for col in cols_to_numeric:
                        if col in window_weather_df.columns:
                            window_weather_df[col] = pd.to_numeric(window_weather_df[col], errors='coerce')
                        else:
                            logger.warning(f"Weather data missing expected column '{col}' for window. Treating as NA.")
                            window_weather_df[col] = pd.NA
                    
                    window_weather_df.dropna(subset=cols_to_numeric, inplace=True)
                    if window_weather_df.empty:
                        logger.info(f"Weather data for window {tide_window.start.strftime('%H:%M')} empty after NA drop for essential numerics.")
                        continue

                    avg_wind_speed = window_weather_df['wind_speed'].mean()
                    max_wind_speed = window_weather_df['wind_speed'].max() 
                    avg_temp = window_weather_df['temperature'].mean()
                    max_precip_chance = window_weather_df['precip_chance'].max()
                    
                    conditions_summary = "Not available"
                    if 'condition_text' in window_weather_df.columns and not window_weather_df['condition_text'].mode().empty:
                        conditions_summary = window_weather_df['condition_text'].mode().iloc[0]

                    logger.debug(f"Window Stats: AvgWind {avg_wind_speed:.1f} (Max {max_wind_speed:.1f})mph, AvgTemp {avg_temp:.1f}F, MaxPrecip {max_precip_chance:.0f}%, Cond: {conditions_summary}")

                    thresholds = app_config['thresholds']
                    if (avg_wind_speed <= float(thresholds['max_wind_speed_mph']) and
                        avg_temp >= float(thresholds['min_temperature_f']) and
                        max_precip_chance <= int(thresholds['max_chance_of_rain_percent'])):
                        
                        suitable_kayaking_windows.append({
                            "start_time": tide_window.start, # datetime object
                            "end_time": tide_window.end,     # datetime object
                            "avg_temp_f": round(avg_temp, 1),
                            "avg_wind_speed_mph": round(avg_wind_speed, 1),
                            "max_wind_speed_mph": round(max_wind_speed, 1),
                            "precip_chance_percent": int(max_precip_chance),
                            "conditions_summary": conditions_summary,
                            "duration_minutes": int(tide_window.duration_minutes)
                        })
                        logger.info(f"Window {tide_window.start.strftime('%H:%M %Z')} to {tide_window.end.strftime('%H:%M %Z')} is SUITABLE.")
                    else:
                        logger.info(f"Window {tide_window.start.strftime('%H:%M %Z')} to {tide_window.end.strftime('%H:%M %Z')} UNSUITABLE. "
                                    f"AvgWind: {avg_wind_speed:.1f} (Max: {thresholds['max_wind_speed_mph']}), "
                                    f"AvgTemp: {avg_temp:.1f} (Min: {thresholds['min_temperature_f']}), "
                                    f"Precip: {max_precip_chance:.0f} (Max: {thresholds['max_chance_of_rain_percent']})")
                
                logger.info(f"{len(suitable_kayaking_windows)} suitable windows after weather filtering.")
                if not suitable_kayaking_windows and not llm_forecast_text:
                    llm_forecast_text = f"No kayaking windows for {tomorrow_local.strftime('%A, %B %d')} met all weather criteria."

        except pd.errors.EmptyDataError:
            logger.error("Pandas operation on empty data during weather filtering.", exc_info=True)
            llm_forecast_text = "Problem processing weather data (empty after cleaning). Forecast incomplete."
        except KeyError as e:
            logger.error(f"Missing expected column in weather data: {e}. Check `get_wu_forecast` output.", exc_info=True)
            llm_forecast_text = "Weather data format error (missing columns). Forecast incomplete."
        except Exception as e:
            logger.error(f"Unexpected error during weather filtering: {e}", exc_info=True)
            llm_forecast_text = "An error occurred during weather data processing. Forecast incomplete."

    # --- 6. Generate LLM Forecast ---
    if not llm_forecast_text: # Only proceed if no prior critical error messages were set
        if suitable_kayaking_windows:
            location_name = app_config.get('location',{}).get('name', 'the configured location')
            data_summary_for_llm = f"Suitable Kayaking Windows for {tomorrow_local.strftime('%A, %B %d, %Y')} at {location_name}:\n"
            for i, window in enumerate(suitable_kayaking_windows, 1):
                data_summary_for_llm += (
                    f"Window {i}: {window['start_time'].strftime('%I:%M %p %Z')} to {window['end_time'].strftime('%I:%M %p %Z')} ({window['duration_minutes']} minutes)\n"
                    f"  - Avg Temp: {window['avg_temp_f']}°F\n"
                    f"  - Avg Wind: {window['avg_wind_speed_mph']} mph (Max gusts: {window['max_wind_speed_mph']} mph)\n"
                    f"  - Rain Chance: {window['precip_chance_percent']}%\n"
                    f"  - Conditions: {window['conditions_summary']}\n"
                )
            logger.info("Generated data summary for LLM.")
            logger.debug(f"LLM Data Summary:\n{data_summary_for_llm}")

            if not openai_api_key:
                logger.error("OpenAI API key (OPENAI_API_KEY) not found. Cannot generate LLM forecast.")
                llm_forecast_text = "LLM forecast could not be generated: Missing OpenAI API key."
            else:
                try:
                    llm_params = app_config.get('llm')
                    if not llm_params or not llm_params.get('provider'):
                        logger.error("LLM configuration missing or incomplete in app_config. Cannot generate LLM forecast.")
                        llm_forecast_text = "LLM configuration is missing/incomplete. Cannot generate narrative."
                    else:
                        logger.info(f"Requesting LLM forecast (Provider: {llm_params.get('provider')}, Model: {llm_params.get('model')}).")
                        llm_forecast_text = get_llm_forecast(
                            data_summary=data_summary_for_llm,
                            rubric=rubric_string,
                            llm_config=llm_params,
                            api_key=openai_api_key
                        )
                        if llm_forecast_text is None:
                            llm_forecast_text = "LLM forecast generation failed (returned None). Check logs for details."
                            logger.error("get_llm_forecast returned None. Review llm_handler logs.")
                        else:
                            logger.info("LLM forecast generated successfully.")
                except Exception as e:
                    logger.error(f"Error during LLM forecast generation: {e}", exc_info=True)
                    llm_forecast_text = "An unexpected error occurred generating the LLM forecast."
        else: # No suitable_kayaking_windows found
             if not llm_forecast_text: # If not already set by weather filtering stage
                location_name = app_config.get('location',{}).get('name', 'the configured location')
                llm_forecast_text = f"No suitable kayaking windows found for {tomorrow_local.strftime('%A, %B %d')} at {location_name} after considering tide and weather conditions."
             logger.info("No suitable windows; LLM summary reflects this.")
    
    # --- 7. Send Notification ---
    notification_title = app_config.get("notifications", {}).get("title", "Kayaking Forecast")
    loc_name_short = app_config.get('location',{}).get('name', 'Your Location')
    notification_title += f" for {loc_name_short} - {tomorrow_local.strftime('%a %b %d')}"

    final_message_body = llm_forecast_text
    if not final_message_body: # Fallback if somehow empty
        final_message_body = "PaddleCast run completed, but no specific forecast information was generated. Please check logs."
        logger.warning("llm_forecast_text was empty before sending notification. Using fallback message.")

    # Optional: Append detailed window data if desired. Currently relies on LLM to summarize.
    # Consider Pushover message limits (1024 characters).

    logger.info(f"Notification Title: '{notification_title}'")
    logger.debug(f"Notification Body (first 200 chars): {final_message_body[:200]}...")

    if notification_service.is_configured():
        try:
            success = notification_service.send_notification(title=notification_title, message=final_message_body)
            if success:
                logger.info("Notification sent successfully via Pushover.")
            else:
                logger.error("Failed to send notification via Pushover (as reported by NotificationService).")
        except Exception as e:
            logger.error(f"Unexpected error sending notification: {e}", exc_info=True)
    else:
        logger.warning("NotificationService not configured (Pushover keys missing). Notification not sent.")

    logger.info("PaddleCast application run completed.")


# --- 8. Error Handling and Main Guard ---
if __name__ == "__main__":
    try:
        main()
    except SystemExit: # Allow sys.exit() to work as expected
        raise
    except Exception as e:
        logger.critical(f"An unhandled exception occurred in main: {e}", exc_info=True)
        # Attempt to send a critical error notification if Pushover is configured
        try:
            pushover_user = os.getenv("PUSHOVER_USER_KEY")
            pushover_token = os.getenv("PUSHOVER_APP_TOKEN")
            if pushover_user and pushover_token:
                fallback_notifier = NotificationService(user_key=pushover_user, app_token=pushover_token)
                fallback_notifier.send_notification(
                    title="PaddleCast CRITICAL ERROR",
                    message=f"The PaddleCast application failed with an unhandled critical exception: {e}. Check logs immediately."
                )
                logger.info("Sent CRITICAL ERROR notification via Pushover.")
        except Exception as ne:
            logger.error(f"Failed to send CRITICAL ERROR notification: {ne}", exc_info=True)
        sys.exit(1)
