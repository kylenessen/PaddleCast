## **Project Description: Kayaking Conditions Notifier for Morro Bay**

### **Overview & Key Objectives**

You want a self-hosted Dockerized Python service that runs daily at 9:00 PM to identify suitable kayaking windows for the following day in Morro Bay. The service will:

1. **Fetch sunrise and sunset times** for the next day (to define a daytime window).  
2. **Identify tidal windows** (from NOAA or a similar service) where the tide is at least 3 ft for at least 90 minutes within that daylight period.  
3. **Check weather conditions** (esp. wind) using reliable APIs (Weather Underground for general weather; potentially multiple wind models for wind data).  
4. **Apply thresholds/rules** (e.g., max wind ≤ 7 mph, temperature ≥ 50°F, no significant rain chance).  
5. **If conditions pass these thresholds**, send all relevant data to an LLM (e.g., ChatGPT, Claude) with a custom system prompt (rubric) to generate a short textual forecast and assessment.  
6. **Notify** you via Pushover (or other channels, in the future).

You would like this system to be **flexible** and **easily configurable** so that you can adjust thresholds, set up new disqualifying rules, or tweak the LLM rubric in a simple YAML or Markdown configuration.

---

## **High-Level Architecture**

1. **Scheduler**  
   - Triggers the script daily at 9 PM local time (PST/PDT with DST support).  
   - Could be:
     - **Cron inside the Docker container**: The container runs constantly, and a crontab entry triggers the Python script.  
     - **External scheduler**: e.g., your system’s cron that spins up the container once per day, runs the script, and then exits.

2. **Python Script** (the “core logic”):
   1. **Configuration Load**  
      - Read thresholds from a YAML file (e.g., `config.yaml`).
      - Read environment variables from `.env` (LLM keys, WU key, etc.).
      - Load the system prompt and rubric from a markdown file (e.g., `rubric.md`).
   2. **Data Fetching**  
      - **Sunrise/Sunset**: Possibly from NOAA API or Weather Underground.  
      - **Tides**: NOAA Tides & Currents API for Morro Bay station.  
      - **Weather** (general forecast): Weather Underground (since you have a key).  
      - **Wind**: Potentially from WU or multiple wind model APIs to improve accuracy (e.g., NOAA GFS, etc.).  
   3. **Tidal Windows Calculation**  
      - Identify all time ranges within sunrise-sunset where tide ≥ 3 ft for ≥ 90 minutes.  
      - If none found, you can skip the rest or still send a “No suitable tide windows” notification.  
   4. **Weather & Threshold Checks**  
      - For each tidal window, pull the relevant weather data.  
      - Check user-defined thresholds (wind speed, chance of rain, temperature, etc.).  
      - Exclude any time window failing thresholds.  
   5. **LLM Forecast Generation**  
      - For the windows that pass thresholds, bundle the data into a structured prompt.  
      - Include your rubric (loaded from `rubric.md`) as a system message or additional context.  
      - Call ChatGPT/Claude with your LLM API key.  
      - Receive short plain-text forecasts.  
   6. **Notifications**  
      - Send one or more messages via Pushover summarizing:
        1. The recommended windows (start/end times, conditions).
        2. The LLM’s textual forecast or summary.  
      - If no valid windows, optionally send “No valid kayaking time tomorrow” notification.

3. **(Optional) Data Storage** (Future Iteration)  
   - If you want to store historical data (predicted vs. actual conditions), you can integrate SQLite or a lightweight database. This is likely out of scope for the first build but can be added later.

---

## **Detailed Components**

### 1. **Configuration**

- **`config.yaml`** (or `settings.yaml`)  
  ```yaml
  location:
    tide_station_id: "9412110"  # NOAA station ID for Morro Bay (example)
    lat: 35.365  # For Morro Bay, optional
    lon: -120.851
  
  thresholds:
    min_tide_ft: 3.0
    min_tide_duration_minutes: 90
    max_wind_speed_mph: 7
    min_temperature_f: 50
    max_chance_of_rain_percent: 20
    # Additional thresholds can be easily added here
  
  schedule:
    daily_run_time: "21:00"  # 9 PM local time
  
  # Example of partial day buffer:
  time_buffer_minutes_before_sunrise: 30
  time_buffer_minutes_after_sunset: 30
  
  # Weather API configuration:
  weather_api:
    service: "wu"  # 'wu' or 'openweathermap' or others
    # If multiple wind sources, list them here
    wind_sources:
      - "noaa_gfs"
      - "windy_com_api"
  
  # LLM settings:
  llm:
    model: "gpt-4"  # or "claude-v1"
    # Possibly more advanced LLM-specific settings
  ```
  
- **`.env`** (not tracked in Git; user populates at runtime or via Docker Desktop environment settings)  
  ```
  LLM_API_KEY=YOUR_SECRET_LLM_KEY
  WU_API_KEY=YOUR_SECRET_WU_KEY
  # NOAA credentials if needed
  ```

- **`rubric.md`** (system prompt / instructions to LLM)  
  ```
  You are an assistant specialized in kayaking conditions assessment.

  # Rubric for Kayaking Conditions
  - Wind is the top priority:
    - Calm or very light breeze -> Excellent
    - Moderate breeze -> Acceptable
    - Windy -> Probably no
    - Whitecaps -> Definitely no
  - Time of Day (preference):
    - Sunset window is best
    - Midday is okay
    - Early morning is least preferred
  - Weather conditions:
    - Clear or scattered clouds -> Best
    - Overcast -> Acceptable
    - Fog -> Worst
    - Rain -> Exclude
  - Temperature:
    - The warmer, the better
    - < 50 F -> Exclude
  - Tidal window:
    - Minimum 90 mins at or above 3 ft
    - Longer windows are better

  # Style:
  - Provide a short, plain-text forecast highlighting:
    - Time windows
    - Wind speed and direction
    - Temperature
    - Weather summary
    - Overall recommendation

  Respond in plain text, referencing the above rubric.
  ```

### 2. **Data Fetching Modules**

1. **Sunrise/Sunset**  
   - Potentially via NOAA or WU.  
   - Parse the JSON response for next-day sunrise and sunset times.  
   - Apply 30-minute buffer before sunrise and after sunset if desired (`time_buffer_minutes_before_sunrise`, etc.).

2. **Tides** (NOAA Tides & Currents)  
   - Make a request for next-day hourly tide predictions for the Morro Bay station ID.  
   - Parse the data to find continuous blocks of time ≥ 3 ft for at least 90 minutes.  
   - Filter those blocks to occur within (sunrise-buffer) to (sunset+buffer).

3. **Weather**  
   - **Weather Underground** for general forecast, including:
     - Temperature
     - Chance of precipitation
     - Cloud cover / conditions (clear, cloudy, overcast, etc.)
   - Possibly **multiple wind sources** (like NOAA GFS, etc.) if you want to do more advanced logic (e.g., average or “majority vote”). For MVP, you might just do WU’s wind forecast.

### 3. **Logic & Threshold Checks**

For each identified tidal window:
1. **Wind**: If average wind > `max_wind_speed_mph`, exclude.  
2. **Temperature**: If average daily temp < `min_temperature_f`, exclude.  
3. **Rain**: If chance of rain > `max_chance_of_rain_percent`, exclude.  
4. **Fog** (optional check): If coverage is “fog” or “dense fog,” you could disqualify or reduce the ranking.  

If the window **passes** all checks, it becomes a valid kayaking window.  

### 4. **LLM Forecast Generation**

- Collect all valid windows (with their times, predicted wind speeds, temperature, cloud cover).  
- Construct a **prompt** that includes:
  1. The rubric from `rubric.md` (as system instructions or higher-level context).  
  2. The day’s data (e.g., a short summary of each window).  
- Send to the LLM (ChatGPT or Claude) with your stored `LLM_API_KEY`.  
- Receive a **plain-text** summary.

### 5. **Notifications**

- Use Pushover to send the final result. You can:
  - Summarize how many windows were found.
  - Include the short text from the LLM.  
- If no windows pass, send a quick notification: “No valid kayaking windows tomorrow.”

---

## **Docker & Deployment**

1. **Project Structure** (example)
   ```
   kayaking-notifier/
   ├─ Dockerfile
   ├─ .dockerignore
   ├─ .env.example
   ├─ config.yaml
   ├─ rubric.md
   ├─ main.py
   ├─ requirements.txt
   └─ ...
   ```

2. **Dockerfile** (conceptual example)
   ```dockerfile
   FROM python:3.10-slim

   # Create app directory
   WORKDIR /app

   # Copy requirements first for caching
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt

   # Copy rest of the code
   COPY . .

   # Option 1: Use cron inside container
   # Install cron if needed (on Debian-based images):
   RUN apt-get update && apt-get install -y cron

   # Copy cron config (if using internal cron approach)
   # e.g., COPY crontab /etc/cron.d/kayak-cron

   # Make script executable, etc.

   # Option 2: Just define an entrypoint
   CMD ["python", "main.py"]
   ```
   
   - If using **internal cron**, you’d place a cron job to run `python /app/main.py` daily at 9 PM.  
   - If using an **external scheduler**, you simply run this container once daily with your host’s cron or orchestration system.

3. **Runtime Configuration**  
   - **Environment Variables**: `LLM_API_KEY`, `WU_API_KEY`, etc. are set at container runtime (through Docker Desktop’s “Environment” tab or a compose file).
   - **`config.yaml`** can be edited on the host or directly in Docker Desktop.  
   - You might need to restart or recreate the container for changes to take effect (which is acceptable in your use case).

---

## **Handling Time Zones & DST**

- Use Python’s [`zoneinfo`](https://docs.python.org/3/library/zoneinfo.html) module or `pytz` to ensure you’re getting the correct local time for Morro Bay.  
- The script can do something like:
  ```python
  from datetime import datetime, timedelta
  from zoneinfo import ZoneInfo

  local_tz = ZoneInfo("America/Los_Angeles")
  now_local = datetime.now(local_tz)
  # ...
  ```

- When scheduling with cron (internal or external), make sure it’s aware of DST or keep the server time in sync with local time.

---

## **Future Enhancements**

1. **Multi-Spot Support**: Expand to other kayaking locations.  
2. **Multiple Wind Model Logic**: Implement advanced “majority vote” or “highest confidence” approach to unify data from NOAA GFS, HRRR, etc.  
3. **Historical Database**:  
   - Use SQLite or PostgreSQL to store daily forecasts and actual conditions.  
   - You can compare the predicted vs. actual to refine thresholds or see which model is most accurate.  
4. **Web Interface**:  
   - Build a simple UI to share daily recommended times with friends/neighbors.  
5. **User Authentication**: If shared publicly, allow them to tweak preferences through a web form.  
6. **More Notification Channels**: Slack, email, SMS, or custom phone apps.

---

## **Example Process Flow**

1. **At 9 PM** local time, the Docker container is either started by an external cron or the internal cron triggers the script.  
2. **main.py** loads config from `config.yaml`, reads `.env` for secrets, and loads `rubric.md`.  
3. **main.py** queries NOAA for tomorrow’s sunrise/sunset + tide data.  
4. **main.py** queries WU (and optional other sources) for tomorrow’s forecast.  
5. It identifies all 3 ft + tide windows of ≥ 90 minutes that occur between sunrise-30 min and sunset+30 min.  
6. For each window, it checks wind speed, temperature, and rain chance against user-defined thresholds.  
7. If a window passes, it is added to a “valid windows” list.  
8. If the list is not empty, the script calls the LLM with the full day’s data and rubric. It receives a short forecast.  
9. The script sends a Pushover notification summarizing:
   - The valid windows
   - The LLM’s forecast text
   - Any additional commentary  
10. If there are no valid windows, it sends a “no windows” notification instead.

---

## **Conclusion**

This project description outlines a **modular, configurable Python service** for daily kayaking-condition alerts in Morro Bay. By separating your **thresholds** (YAML), **rubric** (Markdown), and **sensitive keys** (`.env`), you keep the system easy to maintain and extend. Dockerization ensures you can deploy it consistently anywhere and keep your environment clean. Finally, you can gradually add more advanced features—like multiple wind models, historical data logging, or a web frontend—after confirming the MVP meets your immediate needs.

Use this description as a **guiding reference** for whoever (or whichever LLM) will implement the system. They can refine package choices, API calls, and scheduling details according to your environment and preferences.