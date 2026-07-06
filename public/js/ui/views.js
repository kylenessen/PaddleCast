import { categoryColor, rampColor } from "../core/colors.js";
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

// ---- shared tooltip ----

let tooltip;
function ensureTooltip() {
  if (!tooltip) {
    tooltip = el("div", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

export function attachTooltip(node, textFn) {
  node.addEventListener("mouseenter", () => {
    const tip = ensureTooltip();
    tip.textContent = textFn();
    tip.hidden = false;
    const rect = node.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
    tip.style.top = `${rect.top + window.scrollY - 8}px`;
  });
  node.addEventListener("mouseleave", () => {
    if (tooltip) tooltip.hidden = true;
  });
}

// ---- hourly day view ----

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

  // Hour rows.
  const list = el("div", "hour-list");
  for (const hour of day.hours) {
    const row = el("div", "hour-row");
    row.style.setProperty("--overall", rampColor(hour.score, scheme));
    row.classList.toggle("hour-bad", hour.score >= 1);
    row.appendChild(el("span", "hour-time", fmtHour(hour.time)));

    // Metric columns: the row's width divides equally into one segment
    // per metric so segments line up down the table. The only color is
    // a small dot per metric, emoji inside, tinted by its category; the
    // value sits next to it in plain ink. Segments wrap to a second row
    // when they get too narrow to read.
    const bar = el("div", "metric-bar");
    for (const [key, metric] of Object.entries(hour.metrics)) {
      const meta = METRIC_META[key];
      const seg = el("span", "metric-seg");
      const dot = el("span", "metric-dot", meta.icon);
      dot.style.background = categoryColor(metric.category, scheme);
      seg.appendChild(dot);
      seg.appendChild(el("span", "metric-seg-value", metric.value));
      attachTooltip(seg, () =>
        `${meta.label}: ${metric.value}` +
        (metric.detail ? ` — ${metric.detail}` : "")
      );
      bar.appendChild(seg);
    }
    row.appendChild(bar);
    list.appendChild(row);
  }
  root.appendChild(list);
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
      const counts = { excellent: 0, acceptable: 0, marginal: 0, notForMe: 0 };
      for (const h of day.hours) counts[h.overall]++;
      attachTooltip(cell, () =>
        `${location.name} ${weekdayOf(date)}: ` +
        `${counts.excellent} excellent · ${counts.acceptable} acceptable · ` +
        `${counts.marginal} marginal · ${counts.notForMe} not-for-me hours`
      );
      td.appendChild(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}
