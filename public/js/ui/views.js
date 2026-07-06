import { categoryColor, rampColor, glowColor, textColorOn } from "../core/colors.js";
import { getSettings } from "../storage.js";

const METRIC_META = {
  wind: { icon: "💨", label: "Wind" },
  temp: { icon: "🌡️", label: "Temp" },
  conditions: { icon: "⛅", label: "Sky" },
  tide: { icon: "🌊", label: "Tide" },
  waves: { icon: "〰️", label: "Waves" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function weekdayOf(dateStr) {
  return WEEKDAYS[new Date(dateStr + "T12:00:00").getDay()];
}

function fmtHour(iso) {
  const h = Number(iso.slice(11, 13));
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function fmtClock(iso) {
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const ampm = h < 12 ? "am" : "pm";
  return `${((h + 11) % 12) + 1}:${m}${ampm}`;
}

// ---- hourly day view ----

// A centered full-width row marking the sunrise or sunset that falls
// inside the hour above it. The predicted color quality (core/glow.js)
// renders as a pill tinted along the glow ramp, gray sky through gold
// to vivid coral. Hovering shows the cloud-layer breakdown.
function sunEventRow(event, columns) {
  const tr = el("tr", "dt-sun-row");
  const td = el("td", "dt-sun");
  td.colSpan = columns;
  const icon = event.kind === "sunrise" ? "🌅" : "🌇";
  const name = event.kind === "sunrise" ? "Sunrise" : "Sunset";
  td.appendChild(el("span", "dt-sun-when", `${icon} ${name} ${fmtClock(event.time)}`));
  if (event.quality) {
    const chip = el(
      "span",
      "dt-sun-chip",
      `${event.quality.emoji} ${event.quality.label}`
    );
    const bg = glowColor(event.quality.score);
    chip.style.background = bg;
    chip.style.color = textColorOn(bg);
    td.title = event.quality.detail;
    td.appendChild(chip);
  }
  tr.appendChild(td);
  return tr;
}

export function renderDayView(forecast, dayIndex, { onPickDay }) {
  const scheme = getSettings().scheme;
  const root = el("div", "day-view");
  const day = forecast.days[dayIndex];

  const header = el("header", "day-header");
  header.appendChild(el("h1", "loc-title", forecast.location.name));
  const dateLine = new Date(day.date + "T12:00:00").toLocaleDateString(
    undefined,
    { weekday: "long", month: "long", day: "numeric" }
  );
  header.appendChild(el("h2", "day-date", dateLine));
  header.appendChild(
    el(
      "p",
      "sun-times",
      `First light ${fmtClock(day.sun.firstLight)} · ` +
        `Sunrise ${fmtClock(day.sun.sunrise)} · ` +
        `Sunset ${fmtClock(day.sun.sunset)} · ` +
        `Last light ${fmtClock(day.sun.lastLight)}`
    )
  );
  root.appendChild(header);

  // Day navigation chips. They divide the same width as the hour table
  // below, with labels that compact when the chips get narrow (the
  // container query in style.css swaps which label span shows).
  const nav = el("nav", "day-nav");
  forecast.days.forEach((d, i) => {
    const chip = el("button", "day-chip");
    chip.classList.toggle("active", i === dayIndex);
    const date = new Date(d.date + "T12:00:00");
    const long = `${date.toLocaleDateString(undefined, { weekday: "long" })} ` +
      `${date.getMonth() + 1}/${date.getDate()}`;
    chip.appendChild(el("span", "day-chip-long", long));
    chip.appendChild(el("span", "day-chip-short", weekdayOf(d.date).toUpperCase()));
    chip.appendChild(dayColorBar(d, scheme));
    chip.addEventListener("click", () => onPickDay(i));
    nav.appendChild(chip);
  });
  root.appendChild(nav);

  for (const warning of forecast.warnings) {
    root.appendChild(el("p", "warning", `⚠ ${warning}`));
  }

  // Hour table, same shape as the home page's week table: hours down,
  // one column per metric, so a single column reads as that attribute's
  // arc over the day. Color stays small: each cell leads with the
  // metric's emoji in a category-colored dot (the same chip the old
  // hour list used) and the value sits beside it in plain ink. Wind
  // and wave directions render as an arrow rotated to point where the
  // water or air is going, not compass letters.
  const keys = Object.keys(METRIC_META).filter((k) =>
    day.hours.some((h) => h.metrics[k])
  );

  const table = el("table", "day-table");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.appendChild(el("th", "dt-corner"));
  for (const key of keys) {
    const meta = METRIC_META[key];
    const th = el("th", "dt-metric");
    th.appendChild(el("span", "dt-metric-label", meta.label));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const hour of day.hours) {
    const tr = el("tr");
    const timeCell = el("th", "dt-time", fmtHour(hour.time));
    timeCell.style.setProperty("--overall", rampColor(hour.score, scheme));
    tr.appendChild(timeCell);

    for (const key of keys) {
      const td = el("td", "dt-cell");
      const metric = hour.metrics[key];
      if (metric) {
        const wrap = el("span", "dt-cell-wrap");
        const dot = el("span", "dt-dot", METRIC_META[key].icon);
        dot.style.background = categoryColor(metric.category, scheme);
        wrap.appendChild(dot);
        // The arrow sits between dot and value so it reads as part of
        // this metric, not the next column's. Direction degrees are
        // "coming from"; the arrow shows the flow, so it points the
        // opposite way.
        if (metric.dirDeg != null) {
          const arrow = el("span", "dt-arrow", "↑");
          arrow.style.rotate = `${Math.round(metric.dirDeg + 180) % 360}deg`;
          wrap.appendChild(arrow);
        }
        wrap.appendChild(el("span", "dt-value", metric.value));
        td.appendChild(wrap);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    if (hour.sunEvent) {
      tbody.appendChild(sunEventRow(hour.sunEvent, keys.length + 1));
    }
  }
  table.appendChild(tbody);
  root.appendChild(table);
  return root;
}

// ---- week table (home) ----

// A day's color signature: one solid stripe per hour, no blending
// between hours. Each stripe is the hour's canonical ramp color, the
// same color the hour row accent uses in the day view.
function dayColorBar(day, scheme) {
  const bar = el("span", "day-bar");
  const n = day.hours.length;
  if (n === 0) return bar;
  const colors = day.hours.map((h) => rampColor(h.score, scheme));
  if (n === 1) {
    bar.style.background = colors[0];
    return bar;
  }
  const stops = colors.map(
    (c, i) => `${c} ${(i / n) * 100}%, ${c} ${((i + 1) / n) * 100}%`
  );
  bar.style.background = `linear-gradient(to right, ${stops.join(", ")})`;
  return bar;
}

// One table for the whole home page: a column per forecast day, a row
// per location, each cell that day's hour-stripe timeline linking to
// the full hourly view. Lets "can I paddle somewhere tomorrow?" be
// answered by scanning a single column.
//
// entries: [{ location, forecast }] where forecast may be an Error.
export function renderWeekTable(entries) {
  const scheme = getSettings().scheme;

  // The days shown are the union of every forecast's dates, so the
  // columns stay aligned even if one location is missing a day.
  const dates = [...new Set(
    entries.flatMap(({ forecast }) =>
      forecast instanceof Error ? [] : forecast.days.map((d) => d.date)
    )
  )].sort();

  const table = el("table", "week-table");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.appendChild(el("th", "wt-corner"));
  for (const date of dates) {
    const th = el("th", "wt-day");
    th.appendChild(el("span", "wt-day-name", weekdayOf(date)));
    th.appendChild(el("span", "wt-day-date", date.slice(5).replace("-", "/")));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el("tbody");
  for (const { location, forecast } of entries) {
    const tr = el("tr");
    const nameCell = el("th", "wt-loc");
    const nameLink = el("a", null, location.name);
    nameLink.href = `#/loc/${location.id}`;
    nameCell.appendChild(nameLink);
    tr.appendChild(nameCell);

    if (forecast instanceof Error) {
      const td = el("td", "wt-error", `⚠ ${forecast.message}`);
      td.colSpan = Math.max(dates.length, 1);
      tr.appendChild(td);
      tbody.appendChild(tr);
      continue;
    }

    const byDate = new Map(forecast.days.map((d) => [d.date, d]));
    for (const date of dates) {
      const td = el("td");
      const day = byDate.get(date);
      if (!day) {
        tr.appendChild(td);
        continue;
      }
      const cell = el("a", "wt-cell");
      cell.href = `#/loc/${location.id}?day=${date}`;
      cell.appendChild(dayColorBar(day, scheme));
      td.appendChild(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}
