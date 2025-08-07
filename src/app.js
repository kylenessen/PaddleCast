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
  return `${score.toFixed(1)}★`;
}

function windowBadge(score) {
  if (score >= 4.0) return 'badge good';
  if (score >= 3.0) return 'badge';
  if (score > 0) return 'badge warn';
  return 'badge bad';
}

function renderDay(day) {
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
  if (day.windows && day.windows.length) {
    day.windows.forEach(w => {
      const el = document.createElement('div');
      el.className = 'window';
      const startM = minutesSinceMidnight(day.date, w.start);
      const endM = minutesSinceMidnight(day.date, w.end);
      el.innerHTML = `
        <div><span class="${windowBadge(w.score)}">${formatScore(w.score)}</span></div>
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
  const windows = (day.windows || []).map(w => ({
    start: minutesSinceMidnight(day.date, w.start),
    end: minutesSinceMidnight(day.date, w.end),
    score: w.score
  }));
  window.renderDayChart(canvas, points, windows);
}

async function init() {
  const data = await fetchData();
  if (!data) return;
  const metaEl = document.getElementById('meta');
  const gen = new Date(data.generated_at);
  metaEl.textContent = `${data.location} · Generated ${gen.toLocaleString()}`;

  (data.days || []).forEach(renderDay);
}

init();


