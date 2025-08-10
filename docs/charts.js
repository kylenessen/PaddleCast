/* global Chart */

function formatTick(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function colorIntuitive(t) {
  // t in [0,1]: 0 red -> 0.5 yellow -> 1 green
  t = clamp01(t);
  if (t < 0.5) {
    const u = t / 0.5; // 0..1 red->yellow
    const r = Math.round(lerp(231, 241, u));
    const g = Math.round(lerp(76, 196, u));
    const b = Math.round(lerp(60, 15, u));
    return `rgb(${r},${g},${b})`;
  } else {
    const u = (t - 0.5) / 0.5; // 0..1 yellow->green
    const r = Math.round(lerp(241, 39, u));
    const g = Math.round(lerp(196, 174, u));
    const b = Math.round(lerp(15, 96, u));
    return `rgb(${r},${g},${b})`;
  }
}

function colorViridis(t) {
  // Approximate viridis via sampled stops (color-blind friendly)
  const stops = [
    [68, 1, 84], [71, 44, 122], [59, 81, 139], [44, 113, 142], [33, 144, 141],
    [39, 173, 129], [92, 200, 99], [170, 220, 50], [253, 231, 37]
  ];
  t = clamp01(t);
  const idx = t * (stops.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const u = idx - i0;
  const c0 = stops[i0];
  const c1 = stops[i1];
  const r = Math.round(lerp(c0[0], c1[0], u));
  const g = Math.round(lerp(c0[1], c1[1], u));
  const b = Math.round(lerp(c0[2], c1[2], u));
  return `rgb(${r},${g},${b})`;
}

function scoreToColor(score, palette) {
  // Map score 0..5 to color
  const t = clamp01((score || 0) / 5);
  return palette === 'viridis' ? colorViridis(t) : colorIntuitive(t);
}

function buildSegmentStyles(points, windows, palette) {
  // For each line segment, color by window score overlapping midpoint; default muted when no window
  const styles = [];
  const defaultColor = 'rgba(15,42,63,0.3)';
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mid = (p0.x + p1.x) / 2;
    const overlapping = (windows || []).filter(w => mid >= w.start && mid <= w.end);
    const score = overlapping.length ? overlapping[0].score : null;
    styles.push(score != null ? scoreToColor(score, palette) : defaultColor);
  }
  return styles;
}

window.renderDayChart = function renderDayChart(canvas, points, windows, range, opts) {
  const ctx = canvas.getContext('2d');
  const data = points.sort((a, b) => a.x - b.x);

  const regions = (windows || []).map(w => ({ start: w.start, end: w.end, score: w.score }));

  const xmin = (range && Number.isFinite(range.min)) ? range.min : 0;
  const xmax = (range && Number.isFinite(range.max)) ? range.max : 1440;

  const thresholdFt = (opts && Number.isFinite(opts.thresholdFt)) ? opts.thresholdFt : 2.5;
  const palette = (opts && opts.palette) || 'intuitive';
  const markers = (opts && Array.isArray(opts.markers)) ? opts.markers : [];
  const arcs = (opts && opts.arcs) || {};

  const segmentColors = buildSegmentStyles(data, regions, palette);

  // Plugin to draw horizontal threshold line
  const thresholdPlugin = {
    id: 'thresholdLine',
    afterDraw(chart, args, pluginOpts) {
      const yScale = chart.scales.y;
      const xScale = chart.scales.x;
      if (!yScale || !xScale) return;
      const y = yScale.getPixelForValue(thresholdFt);
      const ctx2 = chart.ctx;
      ctx2.save();
      ctx2.setLineDash([6, 6]);
      ctx2.lineWidth = 1.5;
      ctx2.strokeStyle = 'rgba(231,76,60,0.9)';
      ctx2.beginPath();
      ctx2.moveTo(xScale.left, y);
      ctx2.lineTo(xScale.right, y);
      ctx2.stroke();
      ctx2.setLineDash([]);
      // Label
      ctx2.fillStyle = 'rgba(231,76,60,0.95)';
      ctx2.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif';
      ctx2.fillText(`${thresholdFt.toFixed(1)} ft`, xScale.left + 6, y - 6);
      ctx2.restore();
    }
  };

  // Plugin to draw sunrise/sunset (yellow) and moonrise/moonset (white) dots at top of tide line
  const astroMarkersPlugin = {
    id: 'astroMarkers',
    afterDatasetsDraw(chart) {
      const yScale = chart.scales.y;
      const xScale = chart.scales.x;
      if (!yScale || !xScale) return;
      const ds = chart.data.datasets[0];
      if (!ds || !Array.isArray(ds.data) || ds.data.length === 0) return;
      const ctx2 = chart.ctx;
      ctx2.save();
      markers.forEach(m => {
        const x = xScale.getPixelForValue(m.x);
        // Find y on the tide curve: pick nearest point by x
        let nearest = ds.data[0];
        let bestDx = Infinity;
        for (let i = 0; i < ds.data.length; i++) {
          const p = ds.data[i];
          const dx = Math.abs(p.x - m.x);
          if (dx < bestDx) { bestDx = dx; nearest = p; }
        }
        const y = yScale.getPixelForValue(nearest.y);
        const radius = 4;
        const color = (m.type === 'sunrise' || m.type === 'sunset') ? 'rgba(241,196,15,0.95)' : 'rgba(255,255,255,0.95)';
        const stroke = (m.type === 'sunrise' || m.type === 'sunset') ? 'rgba(160,120,0,0.9)' : 'rgba(200,200,200,0.9)';
        ctx2.beginPath();
        ctx2.arc(x, y, radius, 0, Math.PI * 2);
        ctx2.fillStyle = color;
        ctx2.fill();
        ctx2.lineWidth = 1.5;
        ctx2.strokeStyle = stroke;
        ctx2.stroke();
      });
      ctx2.restore();
    }
  };

  // Plugin to draw daylight and moonlight arcs as subtle top bands
  const astroArcsPlugin = {
    id: 'astroArcs',
    beforeDraw(chart) {
      const xScale = chart.scales.x;
      const area = chart.chartArea;
      if (!xScale || !area) return;
      const ctx2 = chart.ctx;
      const drawBand = (rng, fill, heightPx) => {
        if (!rng) return;
        const left = xScale.getPixelForValue(rng.start);
        const right = xScale.getPixelForValue(rng.end);
        const top = area.top + 2;
        const h = heightPx;
        ctx2.save();
        ctx2.fillStyle = fill;
        ctx2.fillRect(Math.min(left, right), top, Math.abs(right - left), h);
        ctx2.restore();
      };
      // Daylight: pale yellow band
      drawBand(arcs.daylight, 'rgba(241,196,15,0.15)', 6);
      // Moonlight: pale white band below daylight band
      drawBand(arcs.moonlight, 'rgba(255,255,255,0.12)', 4);
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
          segment: {
            borderColor: (ctx) => segmentColors[ctx.p0DataIndex] || '#3e7bb6',
            backgroundColor: (ctx) => (segmentColors[ctx.p0DataIndex] || '#3e7bb6')
          },
          borderColor: '#3e7bb6',
          backgroundColor: 'rgba(62,123,182,0.12)',
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
    plugins: [thresholdPlugin, astroArcsPlugin, astroMarkersPlugin]
  });
};


