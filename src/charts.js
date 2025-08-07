/* global Chart */

function formatTick(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

window.renderDayChart = function renderDayChart(canvas, points, windows, range) {
  const ctx = canvas.getContext('2d');
  const data = points.sort((a, b) => a.x - b.x);

  const regions = (windows || []).map(w => ({ start: w.start, end: w.end, score: w.score }));

  const xmin = (range && Number.isFinite(range.min)) ? range.min : 0;
  const xmax = (range && Number.isFinite(range.max)) ? range.max : 1440;

  // Remove window overlays per request
  const windowPlugin = null;

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Tide (ft)',
          data,
          parsing: false,
          borderColor: '#3e7bb6',
          backgroundColor: 'rgba(62,123,182,0.16)',
          tension: 0.3,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Local Time' },
          min: xmin,
          max: xmax,
          ticks: {
            callback: (v) => formatTick(v),
            maxTicksLimit: 12
          },
          grid: { color: 'rgba(15,42,63,0.06)' }
        },
        y: {
          title: { display: true, text: 'Feet (MLLW)' },
          grid: { color: 'rgba(15,42,63,0.06)' },
          suggestedMin: 0
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items.length ? formatTick(items[0].parsed.x) : '',
            label: (item) => `Tide: ${item.parsed.y.toFixed(2)} ft`
          }
        }
      }
    },
    plugins: windowPlugin ? [windowPlugin] : []
  });
};


