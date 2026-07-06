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

    const dots = el("div", "hour-dots");
    for (const [key, metric] of Object.entries(hour.metrics)) {
      const meta = METRIC_META[key];
      const dot = el("span", "metric-dot");
      dot.style.background = categoryColor(metric.category, scheme);
      dot.appendChild(el("span", "metric-icon", meta.icon));
      attachTooltip(dot, () =>
        `${meta.label}: ${metric.value}` +
        (metric.detail ? ` — ${metric.detail}` : "")
      );
      const cell = el("span", "metric-cell");
      cell.appendChild(dot);
      cell.appendChild(el("span", "metric-value", metric.value));
      dots.appendChild(cell);
    }
    row.appendChild(dots);
    list.appendChild(row);
  }
  root.appendChild(list);
  return root;
}

// ---- week summary ----

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

export function renderLocationSummary(location, forecast, { onPickDay }) {
  const scheme = getSettings().scheme;
  const section = el("section", "loc-summary");
  const title = el("h2", "loc-summary-title", location.name);
  section.appendChild(title);

  if (forecast instanceof Error) {
    section.appendChild(el("p", "warning", `⚠ ${forecast.message}`));
    return section;
  }

  const week = el("div", "week-row");
  forecast.days.forEach((day, i) => {
    const cell = el("button", "week-day");
    cell.appendChild(el("span", "week-day-name", weekdayOf(day.date)));
    cell.appendChild(el("span", "week-day-date", day.date.slice(5).replace("-", "/")));
    cell.appendChild(dayColorBar(day, scheme));
    const counts = { excellent: 0, acceptable: 0, marginal: 0, notForMe: 0 };
    for (const h of day.hours) counts[h.overall]++;
    attachTooltip(cell, () =>
      `${counts.excellent} excellent · ${counts.acceptable} acceptable · ` +
      `${counts.marginal} marginal · ${counts.notForMe} not-for-me hours`
    );
    cell.addEventListener("click", () => onPickDay(i));
    week.appendChild(cell);
  });
  section.appendChild(week);
  return section;
}
