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

  const windowPlugin = {
    id: 'windowShading',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea) return;
      const { left, right, top, bottom } = chartArea;
      const xScale = scales.x;
      ctx.save();
      regions.forEach(r => {
        const x1 = xScale.getPixelForValue(r.start);
        const x2 = xScale.getPixelForValue(r.end);
        const w = Math.max(0, Math.min(right, x2) - Math.max(left, x1));
        if (w <= 0) return;
        // Color based on score
        let fill = 'rgba(255,165,0,0.06)'; // warn
        if (r.score >= 4) fill = 'rgba(91,192,190,0.14)';
        else if (r.score >= 3) fill = 'rgba(91,192,190,0.09)';
        ctx.fillStyle = fill;
        ctx.fillRect(Math.max(left, x1), top, w, bottom - top);
      });
      ctx.restore();
    }
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Tide (ft)',
          data,
          parsing: false,
          borderColor: '#5bc0be',
          backgroundColor: 'rgba(91,192,190,0.2)',
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
          grid: { color: 'rgba(255,255,255,0.06)' }
        },
        y: {
          title: { display: true, text: 'Feet (MLLW)' },
          grid: { color: 'rgba(255,255,255,0.06)' },
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
    plugins: [windowPlugin]
  });
};


