/* global Chart */

function formatTick(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

window.renderDayChart = function renderDayChart(canvas, points) {
  const ctx = canvas.getContext('2d');
  const data = points.sort((a, b) => a.x - b.x);

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
    }
  });
};


