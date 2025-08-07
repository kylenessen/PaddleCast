async function fetchData() {
  const errorEl = document.getElementById('error');
  try {
    const basePath = window.location.pathname.includes('/src/') ? '..' : '.';
    const res = await fetch(`${basePath}/data/data.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Failed to fetch data.json');
    return await res.json();
  } catch (err) {
    errorEl.classList.remove('hidden');
    errorEl.textContent = 'Error loading data. Please try again later.';
    console.error(err);
    return null;
  }
}

function minutesSinceMidnight(dateStr, iso) {
  const d = new Date(iso);
  // Normalize to the same local day
  const midnight = new Date(dateStr + 'T00:00:00');
  return Math.round((d.getTime() - midnight.getTime()) / 60000);
}

function formatHM(mins) {
  let m = Math.max(0, mins);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = h.toString().padStart(2, '0');
  const mmp = mm.toString().padStart(2, '0');
  return `${hh}:${mmp}`;
}

function formatScore(score) {
  // Render 5-star rating with half-star precision using overlay technique
  const s = Math.max(0, Math.min(5, score));
  const pct = (s / 5) * 100; // 0..100
  return `
    <span class="stars" style="--fill:${pct.toFixed(0)}%; --star-color:#FFD700">
      <span class="base">★★★★★</span>
      <span class="fill">★★★★★</span>
    </span>
  `;
}

// color ramp removed; stars now indicate quality with bright yellow fill

function windowBadgeAttrs() {
  // neutral badge; stars provide emphasis
  return 'class="badge"';
}

function shouldIncludeWindow(dayDate, windowStartIso, windowEndIso, daylightStartM, daylightEndM, allowEvening) {
  // Convert to minutes since midnight for quick overlap checks
  const startM = minutesSinceMidnight(dayDate, windowStartIso);
  const endM = minutesSinceMidnight(dayDate, windowEndIso);
  if (allowEvening) return true;
  // Overlap with daylight range
  return Math.max(startM, daylightStartM) < Math.min(endM, daylightEndM);
}

function renderDay(day, opts) {
  const { allowEvening, thresholdFt, palette } = Object.assign({ allowEvening: false, thresholdFt: 2.5, palette: 'intuitive' }, opts || {});
  const daysEl = document.getElementById('days');
  const card = document.createElement('section');
  card.className = 'day-card';

  const header = document.createElement('div');
  header.className = 'day-header';

  const title = document.createElement('h2');
  title.className = 'day-title';
  const date = new Date(day.date + 'T00:00:00');
  title.textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const sun = document.createElement('div');
  sun.className = 'sun';
  if (day.sunrise && day.sunset) {
    const sr = new Date(day.sunrise);
    const ss = new Date(day.sunset);
    sun.textContent = `Sunrise ${sr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · Sunset ${ss.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  header.appendChild(title);
  header.appendChild(sun);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'chart-wrap';
  const canvas = document.createElement('canvas');
  chartWrap.appendChild(canvas);

  const windowsWrap = document.createElement('div');
  windowsWrap.className = 'windows';
  let daylightMin = 0;
  let daylightMax = 1440;
  if (day.sunrise && day.sunset) {
    const srM = minutesSinceMidnight(day.date, day.sunrise) - 30;
    const ssM = minutesSinceMidnight(day.date, day.sunset) + 30;
    daylightMin = Math.max(0, srM);
    daylightMax = Math.min(1440, ssM);
  }

  const filteredWindows = (day.windows || []).filter(w => shouldIncludeWindow(
    day.date,
    w.start,
    w.end,
    daylightMin,
    daylightMax,
    allowEvening
  ));

  if (filteredWindows && filteredWindows.length) {
    filteredWindows.forEach(w => {
      const el = document.createElement('div');
      el.className = 'window';
      const startM = minutesSinceMidnight(day.date, w.start);
      const endM = minutesSinceMidnight(day.date, w.end);
      el.innerHTML = `
        <div><span ${windowBadgeAttrs()}>${formatScore(w.score)}</span></div>
        <div><strong>${formatHM(startM)}</strong> – <strong>${formatHM(endM)}</strong></div>
        <div class="conditions">${w.conditions}</div>
        <div>Avg tide: ${w.avg_tide_ft.toFixed(1)} ft · Avg wind: ${Math.round(w.avg_wind_mph)} mph</div>
      `;
      windowsWrap.appendChild(el);
    });
  } else {
    const none = document.createElement('div');
    none.className = 'conditions';
    none.textContent = 'No suitable windows.';
    windowsWrap.appendChild(none);
  }

  card.appendChild(header);
  card.appendChild(chartWrap);
  card.appendChild(windowsWrap);
  daysEl.appendChild(card);

  // Prepare chart data: X as minutes since midnight
  const points = (day.tide_points || []).map(p => ({ x: minutesSinceMidnight(day.date, p.time), y: p.height_ft }));
  const windows = (filteredWindows || []).map(w => ({
    start: minutesSinceMidnight(day.date, w.start),
    end: minutesSinceMidnight(day.date, w.end),
    score: w.score
  }));
  const range = allowEvening
    ? { min: 0, max: 1440 }
    : { min: daylightMin, max: daylightMax };
  window.renderDayChart(canvas, points, windows, range, { thresholdFt, palette });
}

function clearDays() {
  const daysEl = document.getElementById('days');
  daysEl.innerHTML = '';
}

async function init() {
  const data = await fetchData();
  if (!data) return;
  const metaEl = document.getElementById('meta');
  const gen = new Date(data.generated_at);
  metaEl.textContent = `${data.location} · Generated ${gen.toLocaleString()}`;

  const toggle = document.getElementById('evening-toggle');
  const toggleLabel = document.getElementById('evening-toggle-label');
  const paletteToggle = document.getElementById('palette-toggle');
  const paletteToggleLabel = document.getElementById('palette-toggle-label');

  function renderAll() {
    clearDays();
    const thresholdFt = (data.settings && Number.isFinite(data.settings.min_tide_ft)) ? data.settings.min_tide_ft : 2.5;
    const palette = paletteToggle && paletteToggle.checked ? 'viridis' : 'intuitive';
    (data.days || []).forEach(day => renderDay(day, { allowEvening: toggle.checked, thresholdFt, palette }));
  }

  if (toggle) {
    toggle.addEventListener('change', () => {
      toggleLabel.textContent = toggle.checked ? 'Include evening sessions' : 'Daylight sessions only';
      renderAll();
    });
  }

  if (paletteToggle) {
    paletteToggle.addEventListener('change', () => {
      paletteToggleLabel.textContent = paletteToggle.checked ? 'Color-blind palette (viridis)' : 'Intuitive colors (red→yellow→green)';
      renderAll();
    });
  }

  renderAll();
}

init();


