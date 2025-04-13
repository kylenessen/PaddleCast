## 1. **Initial Setup & Environment**

1. [x] **Set up version control**  
   - [x] Confirm that the repository is initialized (e.g., GitHub, GitLab).  
   - [x] Ensure `.gitignore` and `.dockerignore` are configured properly.

2. [x] **Create or verify file structure**  
   - [x] Confirm `config.yaml`, `.env.example`, `rubric.md`, `main.py`, etc., exist.  
   - [x] Review `project_requirements.md`, `README.md`, `changelog.md`, and this file (`tasks.md`) for completeness.

3. [x] **Install dependencies locally** (optional if you're going to rely solely on Docker)  
   - [x] Use `requirements.txt` to do a `pip install -r requirements.txt`.

4. [x] **Set up environment variables**  
   - [x] Copy `.env.example` to `.env` and populate with keys (LLM API, WU API, etc.).

> **Deliverable**: A stable local environment or Docker setup to start coding.

---

## 2. **Fetch Sunrise & Sunset**

1. [ ] **Decide on API** for sunrise/sunset data. Options:
   - [ ] NOAA API  
   - [ ] Weather Underground  
   - [ ] A dedicated sunrise/sunset API (e.g., [Sunrise-Sunset.org](https://sunrise-sunset.org/api))

2. [ ] **Implement a Python function** to fetch next-day sunrise/sunset (in `main.py` or a helper file):
   - [ ] Parse the JSON response.
   - [ ] Convert times to local time zone (`America/Los_Angeles`) with DST support.

3. [ ] **Add time buffer** (e.g., 30 minutes before sunrise, 30 minutes after sunset) to define your "daylight window."

> **Deliverable**: Function tested with print/debug statements showing correct sunrise/sunset times.

---

## 3. **Fetch Tidal Data**

1. [ ] **Identify the NOAA Tides & Currents endpoint** for Morro Bay.  
2. [ ] **Implement a function** to:
   - [ ] Retrieve next-day (or next 24-hour) tidal predictions (height over time).
   - [ ] Parse the data into a list or DataFrame of timestamps and tide heights.

3. [ ] **Determine tidal windows**  
   - [ ] Filter times where tide is ≥ 3 ft.  
   - [ ] Identify continuous blocks of ≥ 90 minutes within your sunrise-sunset window.

4. [ ] **Verify** with sample data:
   - [ ] Print out the date/times of potential tidal windows.  
   - [ ] Ensure partial periods (e.g., if it starts at 2.9 ft and creeps to 3.0 ft) are handled correctly.

> **Deliverable**: Confirmed logic that outputs valid tidal windows (start/end times, tide height).

---

## 4. **Fetch Weather & Wind Data**

1. [ ] **Integrate Weather Underground** (WU) for general conditions:
   - [ ] Temperature, precipitation chance, sky conditions (cloudy, fog, clear), etc.

2. [ ] **Decide how to handle wind**:
   - [ ] Start with WU wind data for MVP.
   - [ ] If implementing multiple wind models (e.g., NOAA GFS), build a function to retrieve & merge data.

3. [ ] **Implement weather fetching function**:
   - [ ] Filter to the time blocks identified by tides.
   - [ ] Gather average wind speed, max wind speed, direction, temperature, and chance of rain for those windows.

4. [ ] **Test** using print statements or logs:
   - [ ] Compare returned data vs. your thresholds (e.g., wind ≤ 7 mph, temperature ≥ 50°F).

> **Deliverable**: Verified function that returns weather & wind data for each tidal window.

---

## 5. **Apply Thresholds & Rules**

1. [ ] **Load user-defined thresholds** from `config.yaml`:
   - [ ] `min_tide_ft`, `min_tide_duration_minutes`, `max_wind_speed_mph`, `min_temperature_f`, etc.

2. [ ] **Check each tidal window**:
   - [ ] If average wind > `max_wind_speed_mph`, exclude the window.
   - [ ] If temperature < `min_temperature_f`, exclude.
   - [ ] If chance of rain > allowed, exclude.
   - [ ] If it's reported as "fog" and you want to exclude or down-rank, handle that logic here.

3. [ ] **Create a final "valid windows" list**:
   - [ ] Keep only windows that pass all rules.

4. [ ] **Handle "no valid windows"**:
   - [ ] If none pass, you may still want to generate a short "No windows" message.

> **Deliverable**: A consolidated list of final candidate windows with relevant weather/tide data, or an empty list if none qualify.

---

## 6. **LLM Integration**

1. [ ] **Load rubric from `rubric.md`** in your Python script:
   - [ ] Prepare it as a system prompt or a block of text to guide the LLM.

2. [ ] **Construct an LLM query**:
   - [ ] Summarize each valid tidal window (time, tide height, wind, weather).
   - [ ] Provide context about user preferences, gleaned from the rubric.

3. [ ] **Call your chosen LLM** (ChatGPT, Claude, etc.) using:
   - [ ] `LLM_API_KEY` from your `.env`.
   - [ ] Python library or HTTP request to the LLM's API endpoint.

4. [ ] **Receive the response**:
   - [ ] Format it as plain text (e.g., `.text` or `.content`).

5. [ ] **Test**:
   - [ ] Print or log the LLM's output to confirm it references the rubric accurately.

> **Deliverable**: Confirm you can get a short, sensible forecast from the LLM for each valid window.

---

## 7. **Notifications (Pushover)**

1. [ ] **Set up Pushover** credentials in `config.yaml` or `.env`:
   - [ ] Possibly `PUSHOVER_USER_KEY` and `PUSHOVER_APP_TOKEN`.

2. [ ] **Implement a notify function**:
   - [ ] Accept the LLM's forecast text and any additional data.
   - [ ] POST to Pushover's API endpoint.

3. [ ] **Test** sending a sample notification**:
   - [ ] Ensure you receive it on your device.  
   - [ ] Tweak formatting or emojis if desired.

4. [ ] **Handle "no windows" notifications**:
   - [ ] Different message: "No valid windows tomorrow, better luck next time!"

> **Deliverable**: Verified push notifications (or fallback message in logs if Pushover is unavailable).

---

## 8. **Docker Integration**

1. [ ] **Finalize Dockerfile**:
   - [ ] Make sure it installs required Python packages.
   - [ ] (Optional) If you use cron inside the container, install `cron` and set it up.

2. [ ] **Decide on scheduling**:
   - **Internal cron**:  
     - [ ] Add a crontab entry to run `python main.py` daily at 9 PM local time.  
     - [ ] Consider timezone configuration inside the container.
   - **External scheduler**:  
     - [ ] The container spins up once a day via a host cron or a CI pipeline.

3. [ ] **Build & run** the Docker image:
   - [ ] Check environment variable passing (for `.env`).
   - [ ] Confirm logs show successful run.

4. [ ] **Test** end-to-end in Docker**:
   - [ ] Remove or rename existing local Python venv.
   - [ ] Re-run "docker run ..." and see if you get a valid notification.

> **Deliverable**: A self-contained Docker image that runs your script properly, either on a schedule or upon container execution.

---

## 9. **Validation & Testing**

1. [ ] **Edge Cases**:
   - [ ] What if sunrise is very late or sunset is very early?
   - [ ] What if the tide never reaches 3 ft?
   - [ ] Check days with high chance of rain, high wind, or very cold temperatures.

2. [ ] **Local vs. Production**:
   - [ ] Possibly test on a local machine before pushing to your server/NAS.

3. [ ] **Logging**:
   - [ ] Add or improve logging to see errors or successful runs.
   - [ ] Consider rotating logs or storing logs in a volume.

4. [ ] **Collect sample data**:
   - [ ] Manually verify a single day's data with NOAA/WU websites.

> **Deliverable**: Confidence that the script handles typical & edge scenarios gracefully.

---

## 10. **Deployment**

1. [ ] **Host Environment**:
   - [ ] Decide on your hosting solution (local server, VPS, NAS).  
   - [ ] Ensure Docker is installed and up to date.

2. [ ] **Schedule the Container**:
   - [ ] If using an external cron, set up a crontab entry like:
     ```cron
     0 21 * * * docker run --rm --env-file /path/to/.env kayaking-notifier
     ```
   - [ ] If using internal cron, just run the container continuously (it will do the rest).

3. [ ] **Monitor**:
   - [ ] Check logs occasionally to ensure no error states occur.
   - [ ] Confirm notifications continue to arrive at 9 PM each night.

> **Deliverable**: Live instance of your Kayaking Conditions Notifier that triggers automatically every day.

---

## 11. **(Optional) Future Enhancements**

- [ ] **Historical Database**:
  - [ ] Store daily predictions vs. actual observed conditions.
- [ ] **Multi-Wind Models**:
  - [ ] Use NOAA GFS or other wind data. Merge or "majority vote" on wind speed predictions.
- [ ] **Web UI**:
  - [ ] Provide a simple dashboard for viewing next-day windows or historical data.
- [ ] **Multi-Location**:
  - [ ] Extend logic to handle multiple kayaking spots.
- [ ] **Automated Testing**:
  - [ ] Write unit tests for data parsing, threshold checks, etc.

> **Deliverable**: Roadmap for longer-term development once the core MVP is stable.

---

## Notes

- [ ] **Update `changelog.md`** after completing each step or adding new features.  
- [ ] **Use branches** for major tasks or new features to keep your `main` branch stable.  
- [ ] **Tag versions** (e.g., `v0.1.0`, `v0.2.0`) once major milestones are complete.