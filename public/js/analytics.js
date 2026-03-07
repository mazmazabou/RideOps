// analytics.js — Analytics renderers, loaders, and widget orchestrators
// Extracted from app.js. All functions are globals.
// Depends on: chart-utils.js (destroyChart, resolveColor, showAnalyticsSkeleton, makeSortable)
//             campus-themes.js (getCampusPalette, getCurrentCampusPalette from app.js)
//             widget-system.js (createWidgetInstance, registerWidgetLoader)
//             rideops-utils.js (showToastNew, statusBadge)

// ============================================================================
// ANALYTICS MODULE
// ============================================================================
let analyticsLoaded = false;
let analyticsReportData = null;

function getAnalyticsDateParams() {
  const from = document.getElementById('analytics-from')?.value;
  const to = document.getElementById('analytics-to')?.value;
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

// ── Data Caches (avoid duplicate API calls across widgets) ──

var _tardinessCache = { data: null, params: null, promise: null };
var _hotspotsCache = { data: null, params: null, promise: null };

async function fetchTardinessData() {
  var params = getAnalyticsDateParams();
  if (_tardinessCache.data && _tardinessCache.params === params) return _tardinessCache.data;
  if (_tardinessCache.promise && _tardinessCache.params === params) return _tardinessCache.promise;
  _tardinessCache.params = params;
  _tardinessCache.promise = fetch('/api/analytics/tardiness' + params)
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) { _tardinessCache.data = d; _tardinessCache.promise = null; return d; })
    .catch(function() { _tardinessCache.promise = null; return null; });
  return _tardinessCache.promise;
}

async function fetchHotspotsData() {
  var params = getAnalyticsDateParams();
  if (_hotspotsCache.data && _hotspotsCache.params === params) return _hotspotsCache.data;
  if (_hotspotsCache.promise && _hotspotsCache.params === params) return _hotspotsCache.promise;
  _hotspotsCache.params = params;
  _hotspotsCache.promise = fetch('/api/analytics/hotspots' + params)
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(d) { _hotspotsCache.data = d; _hotspotsCache.promise = null; return d; })
    .catch(function() { _hotspotsCache.promise = null; return null; });
  return _hotspotsCache.promise;
}

function setAnalyticsQuickRange(preset) {
  var _today = new Date();
  var todayStr = _today.getFullYear() + '-' + String(_today.getMonth() + 1).padStart(2, '0') + '-' + String(_today.getDate()).padStart(2, '0');
  var fromStr = todayStr;
  var toStr = todayStr;

  switch (preset) {
    case 'today':
      fromStr = todayStr;
      break;
    case '7d': {
      var d7 = new Date(_today.getTime() - 6 * 86400000);
      fromStr = d7.getFullYear() + '-' + String(d7.getMonth() + 1).padStart(2, '0') + '-' + String(d7.getDate()).padStart(2, '0');
      break;
    }
    case 'this-month': {
      var d30 = new Date(_today.getTime() - 29 * 86400000);
      fromStr = d30.getFullYear() + '-' + String(d30.getMonth() + 1).padStart(2, '0') + '-' + String(d30.getDate()).padStart(2, '0');
      break;
    }
  }
  var fromInput = document.getElementById('analytics-from');
  var toInput = document.getElementById('analytics-to');
  if (fromInput) fromInput.value = fromStr;
  if (toInput) toInput.value = toStr;
}

/* ── Academic Term Quick-Select Buttons ── */
var _academicTerms = [];

async function loadAnalyticsTermButtons() {
  try {
    var res = await fetch('/api/academic-terms');
    if (!res.ok) return;
    _academicTerms = await res.json();
  } catch (e) {
    _academicTerms = [];
  }
  renderTermButtons();
}

function renderTermButtons() {
  var container = document.getElementById('analytics-term-buttons');
  if (!container) return;
  container.innerHTML = '';
  if (!_academicTerms.length) return;

  // Determine which terms get inline buttons vs dropdown
  var inlineTerms, dropdownTerms;
  if (_academicTerms.length <= 4) {
    inlineTerms = _academicTerms;
    dropdownTerms = [];
  } else {
    // Sort by proximity to today (most recent start_date first)
    var today = new Date().toISOString().slice(0, 10);
    var sorted = _academicTerms.slice().sort(function(a, b) {
      return Math.abs(new Date(a.start_date) - new Date(today)) - Math.abs(new Date(b.start_date) - new Date(today));
    });
    inlineTerms = sorted.slice(0, 3);
    dropdownTerms = sorted.slice(3);
  }

  // Render inline term buttons
  inlineTerms.forEach(function(term) {
    var btn = document.createElement('button');
    btn.className = 'ro-btn ro-btn--ghost ro-btn--xs';
    btn.setAttribute('data-term-id', term.id);
    btn.setAttribute('data-term-from', term.start_date);
    btn.setAttribute('data-term-to', term.end_date);
    btn.textContent = term.name;
    btn.addEventListener('click', function() { handleTermButtonClick(btn); });
    container.appendChild(btn);
  });

  // Render "More" dropdown if needed
  if (dropdownTerms.length) {
    var wrapper = document.createElement('div');
    wrapper.className = 'analytics-term-more';

    var moreBtn = document.createElement('button');
    moreBtn.className = 'ro-btn ro-btn--ghost ro-btn--xs';
    moreBtn.id = 'analytics-term-more-btn';
    moreBtn.innerHTML = 'More <i class="ti ti-chevron-down" style="font-size:12px;"></i>';
    moreBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var dd = document.getElementById('analytics-term-dropdown');
      if (dd) dd.classList.toggle('open');
    });

    var dropdown = document.createElement('div');
    dropdown.className = 'analytics-term-dropdown';
    dropdown.id = 'analytics-term-dropdown';

    dropdownTerms.forEach(function(term) {
      var item = document.createElement('button');
      item.className = 'analytics-term-dropdown-item';
      item.setAttribute('data-term-id', term.id);
      item.setAttribute('data-term-from', term.start_date);
      item.setAttribute('data-term-to', term.end_date);
      item.textContent = term.name;
      item.addEventListener('click', function() { handleTermButtonClick(item); });
      dropdown.appendChild(item);
    });

    wrapper.appendChild(moreBtn);
    wrapper.appendChild(dropdown);
    container.appendChild(wrapper);
  }

  highlightActiveTermButton();
}

function handleTermButtonClick(btn) {
  // Clear active state from all quick-select buttons and term buttons
  document.querySelectorAll('.analytics-quick-select button[data-range]').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('[data-term-id]').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');

  var fromInput = document.getElementById('analytics-from');
  var toInput = document.getElementById('analytics-to');
  if (fromInput) fromInput.value = btn.dataset.termFrom;
  if (toInput) toInput.value = btn.dataset.termTo;

  // Close dropdown if open
  var dropdown = document.getElementById('analytics-term-dropdown');
  if (dropdown) dropdown.classList.remove('open');

  // Invalidate caches and trigger refresh via the refresh button (reloadActiveAnalyticsTab is local to DOMContentLoaded)
  _tardinessCache.data = null;
  _hotspotsCache.data = null;
  var refreshBtn = document.getElementById('analytics-refresh-btn');
  if (refreshBtn) refreshBtn.click();
}

function highlightActiveTermButton() {
  var from = document.getElementById('analytics-from');
  var to = document.getElementById('analytics-to');
  if (!from || !to) return;
  var fromVal = from.value;
  var toVal = to.value;
  document.querySelectorAll('[data-term-id]').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.termFrom === fromVal && btn.dataset.termTo === toVal);
  });
}

// Close term dropdown on outside click
document.addEventListener('click', function(e) {
  var dropdown = document.getElementById('analytics-term-dropdown');
  if (dropdown && dropdown.classList.contains('open')) {
    var moreBtn = document.getElementById('analytics-term-more-btn');
    if (!dropdown.contains(e.target) && e.target !== moreBtn) {
      dropdown.classList.remove('open');
    }
  }
});

/* ── Chart tooltip helpers ── */
function getChartTooltip() {
  let el = document.getElementById('chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chart-tooltip';
    el.className = 'chart-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function showChartTooltip(e, text) {
  const tip = getChartTooltip();
  tip.textContent = text;
  tip.classList.add('visible');
  positionChartTooltip(e, tip);
}

function hideChartTooltip() {
  const tip = document.getElementById('chart-tooltip');
  if (tip) tip.classList.remove('visible');
}

function positionChartTooltip(e, tip) {
  let left = e.clientX + 12;
  let top = e.clientY - 8;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  if (left + tw > window.innerWidth - 8) left = e.clientX - tw - 12;
  if (top + th > window.innerHeight - 8) top = window.innerHeight - th - 8;
  if (top < 8) top = 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

// Helper: derive logical widget size from GridStack node width
function getWidgetSize(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return null;
  var gsItem = el.closest('.grid-stack-item');
  if (!gsItem || !gsItem.gridstackNode) return null;
  var w = gsItem.gridstackNode.w;
  if (w <= 3) return 'xs';
  if (w <= 6) return 'sm';
  if (w <= 9) return 'md';
  return 'lg';
}

function renderColumnChart(containerId, data, options = {}) {
  var container = document.getElementById(containerId);
  if (!container) return;
  destroyChart(containerId);

  if (!data || !data.length) {
    // Empty state — developer-defined static content, safe for innerHTML
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-bar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No ride data for this period.</div></div>';
    return;
  }

  var total = data.reduce(function(s, d) { return s + (parseInt(d.count) || 0); }, 0);
  var unit = options.unit || 'rides';
  var palette = options.palette || null;
  var fillColor = options.color || 'var(--color-primary)';

  // Build canvas via DOM API
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';
  var canvas = document.createElement('canvas');
  canvas.id = containerId + '-canvas';
  wrapper.appendChild(canvas);
  container.textContent = '';
  container.appendChild(wrapper);

  var barColors;
  if (palette) {
    barColors = data.map(function(d, i) { return resolveColor(palette[i % palette.length]); });
  } else {
    var resolved = resolveColor(fillColor);
    barColors = data.map(function() { return resolved; });
  }

  _chartInstances[containerId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(function(d) { return d.label; }),
      datasets: [{
        data: data.map(function(d) { return parseInt(d.count) || 0; }),
        backgroundColor: barColors,
        borderRadius: 3,
        borderSkipped: false,
        maxBarThickness: 50
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              var val = context.parsed.y;
              var pct = total > 0 ? Math.round(val / total * 100) : 0;
              return val + ' ' + unit + ' (' + pct + '%)';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: resolveColor('var(--color-text-muted)'),
            maxRotation: 45,
            autoSkip: true,
            autoSkipPadding: 8
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: resolveColor('var(--color-border-light)')
          },
          ticks: {
            font: { size: 11 },
            color: resolveColor('var(--color-text-muted)'),
            precision: 0
          }
        }
      }
    }
  });
}

function renderLineChart(containerId, data, options = {}) {
  var wrap = document.getElementById(containerId);
  if (!wrap) return;
  destroyChart(containerId);

  if (!data || !data.length) {
    wrap.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-line"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No daily trend data for this period.</div></div>';
    return;
  }

  var lineColor = resolveColor(options.color || 'var(--color-primary)');
  var unit = options.unit || '';

  // Build canvas via DOM API
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';
  var canvas = document.createElement('canvas');
  canvas.id = containerId + '-canvas';
  wrapper.appendChild(canvas);
  wrap.textContent = '';
  wrap.appendChild(wrapper);

  // Create gradient fill programmatically after chart init
  var gradientFill = null;

  _chartInstances[containerId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(function(d) { return d.label; }),
      datasets: [{
        data: data.map(function(d) { return d.value; }),
        borderColor: lineColor,
        borderWidth: 2.5,
        backgroundColor: function(context) {
          if (gradientFill) return gradientFill;
          var chart = context.chart;
          var ctx = chart.ctx, area = chart.chartArea;
          if (!area) return lineColor;
          gradientFill = ctx.createLinearGradient(0, area.top, 0, area.bottom);
          gradientFill.addColorStop(0, lineColor + '26'); // ~15% opacity
          gradientFill.addColorStop(1, lineColor + '05'); // ~2% opacity
          return gradientFill;
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: lineColor,
        pointHoverBorderColor: resolveColor('var(--color-surface)'),
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (options.tooltipFn && data[context.dataIndex] && data[context.dataIndex].raw) {
                return options.tooltipFn(data[context.dataIndex].raw);
              }
              return context.parsed.y + ' ' + unit;
            },
            title: function(items) {
              return items[0] ? items[0].label : '';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: resolveColor('var(--color-text-muted)'),
            maxRotation: 45,
            autoSkip: true,
            autoSkipPadding: 12
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: resolveColor('var(--color-border-light)')
          },
          ticks: {
            font: { size: 11 },
            color: resolveColor('var(--color-text-muted)'),
            precision: 0
          }
        }
      }
    }
  });
}

function renderStackedBar(containerId, segments, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const total = segments.reduce((s, seg) => s + (parseInt(seg.count) || 0), 0);
  const unit = options.unit || '';
  if (total === 0) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-bar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No ride data for this period.</div></div>';
    return;
  }

  const trackHtml = segments.map((seg, i) => {
    const pct = (seg.count / total * 100);
    return `<div class="stacked-bar__seg" style="width:${pct}%;background:${seg.color};" data-idx="${i}"></div>`;
  }).join('');

  const legendHtml = segments.map((seg, i) => {
    const pct = Math.round(seg.count / total * 100);
    return `<div class="stacked-bar__legend-item" data-idx="${i}">
      <span class="stacked-bar__legend-dot" style="background:${seg.color};"></span>
      <span>${seg.label}</span>
      <span class="stacked-bar__legend-value">${seg.count}</span>
      <span class="stacked-bar__legend-pct">${pct}%</span>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="stacked-bar__track">${trackHtml}</div><div class="stacked-bar__legend">${legendHtml}</div>`;

  // Tooltips on segments and legend items
  container.querySelectorAll('[data-idx]').forEach(el => {
    const idx = parseInt(el.dataset.idx);
    const seg = segments[idx];
    const pct = Math.round(seg.count / total * 100);
    const text = `${seg.label}: ${seg.count} ${unit} (${pct}%)`;
    el.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    el.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    el.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderHotspotList(containerId, items, colorClass, unit) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!items || !items.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-map-pin-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No location data available.</div></div>';
    return;
  }
  const pal = getCurrentCampusPalette();
  const max = Math.max(...items.map(i => parseInt(i.count) || 0));
  container.innerHTML = '<div class="hotspot-list">' + items.map((item, idx) => {
    const val = parseInt(item.count) || 0;
    const pct = max > 0 ? (val / max * 100) : 0;
    const name = item.location || item.route;
    const barFillColor = pal[idx % pal.length];
    return `<div class="hotspot-item">
      <div class="hotspot-rank">#${idx + 1}</div>
      <div class="hotspot-name" title="${name}">${name}</div>
      <div class="hotspot-bar"><div class="hotspot-bar-fill" style="width:${pct}%;background:${barFillColor};"></div></div>
      <div class="hotspot-count">${val}</div>
    </div>`;
  }).join('') + '</div>';
  // Attach hover tooltips
  const total = items.reduce((s, i) => s + (parseInt(i.count) || 0), 0);
  const u = unit || 'rides';
  container.querySelectorAll('.hotspot-item').forEach((row, idx) => {
    const item = items[idx];
    const val = parseInt(item.count) || 0;
    const name = item.location || item.route;
    const pct = total > 0 ? Math.round(val / total * 100) : 0;
    const text = `#${idx + 1} ${name}: ${val} ${u} (${pct}%)`;
    row.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    row.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    row.addEventListener('mouseleave', hideChartTooltip);
  });
}

function renderODMatrix(containerId, matrixData) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!matrixData || !matrixData.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-grid-dots"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No route data available.</div></div>';
    return;
  }

  // Extract unique origins and destinations (top 8 each by frequency)
  const originCounts = {}, destCounts = {};
  matrixData.forEach(r => {
    originCounts[r.pickup_location] = (originCounts[r.pickup_location] || 0) + parseInt(r.count);
    destCounts[r.dropoff_location] = (destCounts[r.dropoff_location] || 0) + parseInt(r.count);
  });
  const origins = Object.entries(originCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  const dests = Object.entries(destCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

  // Build count lookup
  const lookup = {};
  matrixData.forEach(r => { lookup[`${r.pickup_location}__${r.dropoff_location}`] = parseInt(r.count); });
  const maxCount = Math.max(...matrixData.map(r => parseInt(r.count)));

  // Shorten location names for display
  const shorten = (name) => name.length > 16 ? name.slice(0, 14) + '\u2026' : name;

  let html = '<div class="od-matrix" style="overflow-x:auto;">';
  html += '<table style="border-collapse:collapse;width:100%;font-size:12px;">';
  html += '<thead><tr><th class="od-row-header" style="text-align:left;padding:4px 8px;font-size:11px;color:var(--color-text-muted);">Origin \u2193 / Dest \u2192</th>';
  dests.forEach(d => {
    html += `<th style="padding:4px 6px;font-size:10px;color:var(--color-text-muted);text-align:center;max-width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${d}">${shorten(d)}</th>`;
  });
  html += '</tr></thead><tbody>';

  origins.forEach(o => {
    html += `<tr><td class="od-row-header" style="padding:4px 8px;font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;" title="${o}">${shorten(o)}</td>`;
    dests.forEach(d => {
      const count = lookup[`${o}__${d}`] || 0;
      if (o === d || count === 0) {
        html += '<td class="od-cell od-cell--empty" style="text-align:center;padding:4px 6px;color:var(--color-text-muted);">\u2014</td>';
      } else {
        const intensity = Math.max(0.1, count / maxCount);
        const bg = `rgba(70, 130, 180, ${intensity})`;
        const textColor = intensity > 0.5 ? '#fff' : 'var(--color-text)';
        html += `<td class="od-cell" style="text-align:center;padding:4px 6px;background:${bg};color:${textColor};border-radius:3px;font-weight:600;cursor:default;" title="${o} \u2192 ${d}: ${count} rides" data-origin="${o}" data-dest="${d}" data-count="${count}">${count}</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div class="od-matrix-note" style="font-size:11px;color:var(--color-text-muted);margin-top:8px;">Top 8 origins \u00D7 top 8 destinations. Darker = higher volume.</div>';
  container.innerHTML = html;

  // Tooltips on cells
  container.querySelectorAll('.od-cell:not(.od-cell--empty)').forEach(cell => {
    const text = `${cell.dataset.origin} \u2192 ${cell.dataset.dest}: ${cell.dataset.count} rides`;
    cell.addEventListener('mouseenter', (e) => showChartTooltip(e, text));
    cell.addEventListener('mousemove', (e) => positionChartTooltip(e, getChartTooltip()));
    cell.addEventListener('mouseleave', hideChartTooltip);
  });
}

function getKpiColorClass(label, value) {
  const num = parseFloat(value);
  if (label === 'Completion Rate') {
    if (num >= 80) return 'kpi-card--good';
    return 'kpi-card--neutral';
  }
  if (label === 'No-Shows') {
    if (num === 0) return 'kpi-card--good';
    if (num <= 3) return 'kpi-card--warning';
    return 'kpi-card--danger';
  }
  if (label === 'Completed') return 'kpi-card--good';
  return 'kpi-card--neutral';
}

function renderKPIGrid(summaryData, tardinessData, fleetData) {
  const grid = document.getElementById('analytics-kpi-grid');
  if (!grid) return;

  const total = summaryData.totalRides || 0;
  const completionRate = summaryData.completionRate || 0;
  const noShowRate = summaryData.noShowRate || 0;
  const activeRiders = summaryData.uniqueRiders || 0;

  // Driver punctuality from tardiness data
  var punctuality = 100;
  if (tardinessData && tardinessData.summary) {
    var totalClockIns = tardinessData.summary.totalClockIns || 0;
    var tardyCount = tardinessData.summary.tardyCount || 0;
    punctuality = totalClockIns > 0 ? Math.round((totalClockIns - tardyCount) / totalClockIns * 100) : 100;
  }

  // Fleet availability
  var fleetAvail = '\u2014';
  if (fleetData && fleetData.summary) {
    var available = fleetData.summary.available || 0;
    var fleetTotal = fleetData.summary.totalFleet || 0;
    fleetAvail = fleetTotal > 0 ? available + '/' + fleetTotal : '\u2014';
  }

  const kpis = [
    { label: 'Total Rides', value: total, icon: 'ti-car', colorClass: 'kpi-card--neutral' },
    { label: 'Completion Rate', value: completionRate + '%', icon: 'ti-circle-check', colorClass: completionRate >= 85 ? 'kpi-card--good' : completionRate >= 70 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'No-Show Rate', value: noShowRate + '%', icon: 'ti-user-x', colorClass: noShowRate <= 5 ? 'kpi-card--good' : noShowRate <= 15 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'Active Riders', value: activeRiders, icon: 'ti-users', colorClass: 'kpi-card--neutral' },
    { label: 'Driver Punctuality', value: punctuality + '%', icon: 'ti-clock-check', colorClass: punctuality >= 90 ? 'kpi-card--good' : punctuality >= 80 ? 'kpi-card--warning' : 'kpi-card--danger' },
    { label: 'Fleet Available', value: fleetAvail, icon: 'ti-bus', colorClass: 'kpi-card--neutral' }
  ];

  grid.innerHTML = kpis.map(function(k) {
    return '<div class="kpi-card ' + k.colorClass + '">' +
      '<div class="kpi-value">' + k.value + '</div>' +
      '<div class="kpi-label"><i class="ti ' + k.icon + '" style="margin-right:4px;"></i>' + k.label + '</div>' +
    '</div>';
  }).join('');
}

function renderVehicleCards(vehicles) {
  const grid = document.getElementById('vehicles-grid');
  if (!grid) return;
  if (!vehicles || !vehicles.length) {
    grid.innerHTML = '<div class="ro-empty"><i class="ti ti-bus-off"></i><div class="ro-empty__title">No vehicles</div><div class="ro-empty__message">Add vehicles to track fleet usage.</div></div>';
    return;
  }
  const sorted = [...vehicles].sort((a, b) => {
    if ((a.status === 'retired') !== (b.status === 'retired')) return a.status === 'retired' ? 1 : -1;
    return 0;
  });
  const hasActive = sorted.some(v => v.status !== 'retired');
  const hasRetired = sorted.some(v => v.status === 'retired');
  grid.innerHTML = sorted.map((v, i) => {
    const divider = (hasActive && hasRetired && i > 0 && v.status === 'retired' && sorted[i - 1].status !== 'retired')
      ? '<div class="vehicle-section-divider"><span>Archived</span></div>' : '';
    const overdueClass = v.maintenanceOverdue ? ' maintenance-overdue' : '';
    const alert = v.maintenanceOverdue
      ? `<div class="maintenance-alert">Maintenance overdue (${v.daysSinceMaintenance} days since last service)</div>` : '';
    const lastMaint = v.last_maintenance_date
      ? new Date(v.last_maintenance_date).toLocaleDateString() : 'Never';
    const lastUsed = v.lastUsed ? new Date(v.lastUsed).toLocaleDateString() : 'Never';
    const retiredClass = v.status === 'retired' ? ' vehicle-retired' : '';
    const retiredBadge = v.status === 'retired' ? '<span class="retired-badge">Retired</span>' : '';
    const escapedName = (v.name||'').replace(/'/g, "\\'");
    let actionButtons;
    if (v.status === 'retired') {
      actionButtons = `<button class="btn secondary small" onclick="reactivateVehicle('${v.id}', '${escapedName}')">Reactivate</button>`;
    } else if (v.rideCount > 0) {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn secondary small" title="Mark this vehicle as no longer in service. History is preserved." onclick="retireVehicle('${v.id}', '${escapedName}')">Retire</button>`;
    } else {
      actionButtons = `<button class="btn secondary small" onclick="logVehicleMaintenance('${v.id}')">Log Maintenance</button>
        <button class="btn danger small" title="Permanently remove this vehicle from the system. Use only if the vehicle was entered in error." onclick="deleteVehicle('${v.id}', '${escapedName}')">Delete</button>`;
    }
    return `${divider}<div class="vehicle-card${overdueClass}${retiredClass}" onclick="openVehicleDrawer('${v.id}')">
      <div class="vehicle-name">${v.name}${retiredBadge}</div>
      <div class="vehicle-meta">Type: ${v.type} &middot; Status: ${v.status}</div>
      <div class="vehicle-meta">Completed rides: ${v.rideCount} &middot; Last used: ${lastUsed}</div>
      <div class="vehicle-meta">Last maintenance: ${lastMaint}</div>
      ${alert}
      <div class="ride-actions-compact" style="margin-top:8px;" onclick="event.stopPropagation()">
        ${actionButtons}
      </div>
    </div>`;
  }).join('');
}

function renderMilestoneList(containerId, people, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!people || !people.length) {
    container.innerHTML = `<div class="ro-empty"><i class="ti ti-trophy-off"></i><div class="ro-empty__title">No ${type} data</div><div class="ro-empty__message">No completed rides yet.</div></div>`;
    return;
  }
  const badgeLabels = { 50: 'Rising Star', 100: 'Century Club', 250: 'Quarter Thousand', 500: (tenantConfig?.orgShortName || 'RideOps') + ' Legend', 1000: 'Diamond' };
  const badgeIcons = { 50: '<i class="ti ti-star"></i>', 100: '<i class="ti ti-award"></i>', 250: '<i class="ti ti-trophy"></i>', 500: '<i class="ti ti-crown"></i>', 1000: '<i class="ti ti-diamond"></i>' };
  container.innerHTML = '<div class="milestone-list">' + people.map(p => {
    const badges = [50, 100, 250, 500, 1000].map(m => {
      const earned = p.achievedMilestones.includes(m);
      return `<span class="milestone-badge${earned ? ' earned' : ''}" title="${badgeLabels[m]}">${badgeIcons[m]} ${m}</span>`;
    }).join('');
    const pct = p.nextMilestone ? Math.max(Math.min((p.rideCount / p.nextMilestone * 100), 100), 2).toFixed(1) : 100;
    const label = p.nextMilestone ? `${p.rideCount} / ${p.nextMilestone} rides` : 'All milestones achieved!';
    return `<div class="milestone-card">
      <div class="milestone-name">${p.name}</div>
      <div class="milestone-count">${p.rideCount} completed rides</div>
      <div class="milestone-badges">${badges}</div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:0%" data-target="${pct}"></div></div>
      <div class="progress-label">${label}</div>
    </div>`;
  }).join('') + '</div>';
  // Animate progress bars
  requestAnimationFrame(() => {
    container.querySelectorAll('.progress-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  });
}

function renderSemesterReport(data) {
  const container = document.getElementById('semester-report-content');
  if (!container) return;
  analyticsReportData = data;

  function delta(curr, prev) {
    if (!prev || prev === 0) return '';
    const diff = curr - prev;
    if (diff === 0) return '';
    const arrow = diff > 0 ? 'ti-arrow-up' : 'ti-arrow-down';
    const cls = diff > 0 ? 'delta--up' : 'delta--down';
    const formatted = Number.isInteger(diff) ? Math.abs(diff) : parseFloat(Math.abs(diff).toFixed(2));
    return `<span class="delta ${cls}"><i class="ti ${arrow}"></i>${formatted}</span>`;
  }

  function statBlock(stats, label, prevStats) {
    return `<div class="semester-period">
      <h4>${label}</h4>
      <div class="semester-stat"><div class="stat-value">${stats.completedRides}${prevStats ? delta(stats.completedRides, prevStats.completedRides) : ''}</div><div class="stat-label">Rides Completed</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.peopleHelped ?? 0}${prevStats ? delta(stats.peopleHelped ?? 0, prevStats.peopleHelped ?? 0) : ''}</div><div class="stat-label">People Helped</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.completionRate}%${prevStats ? delta(stats.completionRate, prevStats.completionRate) : ''}</div><div class="stat-label">Completion Rate</div></div>
      <div class="semester-stat"><div class="stat-value">${stats.noShows}${prevStats ? delta(stats.noShows, prevStats.noShows) : ''}</div><div class="stat-label">No-Shows</div></div>
    </div>`;
  }

  let monthlyTable = '';
  if (data.monthlyBreakdown && data.monthlyBreakdown.length) {
    monthlyTable = `<h4 style="margin-top:16px;">Monthly Breakdown</h4>
    <table class="grid-table"><thead><tr><th>Month</th><th>Completed</th><th>Total</th><th>Riders</th></tr></thead><tbody>
    ${data.monthlyBreakdown.map(m => `<tr><td>${new Date(m.month + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td><td>${m.completed}</td><td>${m.total}</td><td>${m.riders}</td></tr>`).join('')}
    </tbody></table>`;
  }

  let leaderboard = '';
  if (data.driverLeaderboard && data.driverLeaderboard.length) {
    leaderboard = `<h4 style="margin-top:16px;">Driver Leaderboard</h4>
    <table class="grid-table"><thead><tr><th>Driver</th><th>Completed Rides</th></tr></thead><tbody>
    ${data.driverLeaderboard.map(d => `<tr><td>${d.name}</td><td>${d.completed}</td></tr>`).join('')}
    </tbody></table>`;
  }

  container.innerHTML = `
    <div class="semester-comparison">
      ${statBlock(data.previous, data.previousLabel + ' (Previous)')}
      ${statBlock(data.current, data.semesterLabel + ' (Current)', data.previous)}
    </div>
    ${monthlyTable}
    ${leaderboard}
  `;

  // RideOps Wrapped
  const wrapped = document.getElementById('ro-wrapped-content');
  if (wrapped) {
    const c = data.current;
    const mvp = data.driverLeaderboard?.[0];
    if (c.completedRides === 0) {
      wrapped.innerHTML = `<div class="ro-wrapped">
        <div class="wrapped-grid">
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-road"></i></div><div class="wrapped-card__value">0</div><div class="wrapped-card__label">Rides Completed</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-users"></i></div><div class="wrapped-card__value">0</div><div class="wrapped-card__label">People Helped</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-percentage"></i></div><div class="wrapped-card__value">\u2014</div><div class="wrapped-card__label">Completion Rate</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-star"></i></div><div class="wrapped-card__value">\u2014</div><div class="wrapped-card__label">MVP Driver</div></div>
        </div>
      </div>`;
    } else {
      wrapped.innerHTML = `<div class="ro-wrapped">
        <div class="wrapped-grid">
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-road"></i></div><div class="wrapped-card__value">${c.completedRides}</div><div class="wrapped-card__label">Rides Completed</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-users"></i></div><div class="wrapped-card__value">${c.peopleHelped ?? 0}</div><div class="wrapped-card__label">People Helped</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-percentage"></i></div><div class="wrapped-card__value">${c.completionRate}%</div><div class="wrapped-card__label">Completion Rate</div></div>
          <div class="wrapped-card"><div class="wrapped-card__icon"><i class="ti ti-star"></i></div><div class="wrapped-card__value">${mvp ? mvp.name : '\u2014'}</div><div class="wrapped-card__label">${mvp ? `MVP \u00B7 ${mvp.completed} rides` : 'MVP Driver'}</div></div>
        </div>
      </div>`;
    }
  }
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_COLORS = { completed: 'green', cancelled: 'orange', no_show: 'red', denied: '', pending: 'gold', approved: '', scheduled: '' };

function getStatusColor(status) {
  const map = {
    completed: 'var(--status-completed)', cancelled: 'var(--status-cancelled)',
    no_show: 'var(--status-no-show)', denied: 'var(--status-denied)',
    pending: 'var(--status-pending)', approved: 'var(--status-approved)',
    scheduled: 'var(--status-scheduled)', driver_on_the_way: 'var(--status-on-the-way)',
    driver_arrived_grace: 'var(--status-grace)'
  };
  return map[status] || 'var(--color-primary)';
}

async function loadAnalyticsSummary() {
  // KPI rendering is now handled by loadAllAnalytics which combines summary + tardiness + fleet data.
  // This function is kept for compatibility but no longer renders KPIs directly.
  try {
    const res = await fetch('/api/analytics/summary' + getAnalyticsDateParams());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { console.error('Analytics summary error:', e); return null; }
}

async function loadAnalyticsFrequency() {
  try {
    const res = await fetch('/api/analytics/frequency' + getAnalyticsDateParams());
    if (!res.ok) return;
    const data = await res.json();

    // Day of week — column chart (respect operating_days setting)
    const opsConfig = typeof getOpsConfig === 'function' ? await getOpsConfig() : null;
    const opDays = opsConfig && opsConfig.operating_days
      ? String(opsConfig.operating_days).split(',').map(Number)
      : [0, 1, 2, 3, 4, 5, 6]; // fallback all days (our format)
    const dowData = opDays.map(d => {
      const pgDow = (d + 1) % 7; // our 0=Mon → PG DOW 1=Mon
      const row = data.byDayOfWeek.find(r => parseInt(r.dow) === pgDow);
      return { label: DOW_NAMES[pgDow], count: row ? row.count : 0 };
    });
    renderColumnChart('chart-dow', dowData, { unit: 'rides', palette: getCurrentCampusPalette() });

    // Hourly — column chart (short labels: "8a", "12p", "3p")
    const _hourCompact = getWidgetSize('chart-hour') === 'xs';
    const hourData = data.byHour
      .filter(r => parseInt(r.hour) >= 8 && parseInt(r.hour) <= 19)
      .map(r => {
        var h = parseInt(r.hour);
        var shortLabel = h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';
        return { label: _hourCompact ? shortLabel : h + ':00', count: r.count };
      });
    renderColumnChart('chart-hour', hourData, { unit: 'rides', palette: getCurrentCampusPalette() });

    // Daily volume — line chart
    const lineData = data.daily.slice(-30).map(r => ({
      label: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: parseInt(r.total) || 0, raw: r
    }));
    renderLineChart('chart-daily', lineData, { unit: 'rides', color: getCurrentCampusPalette()[0] });

    // Status breakdown — stacked bar (filter transient statuses)
    const hiddenStatuses = ['driver_on_the_way', 'driver_arrived_grace'];
    const statusSegments = data.byStatus
      .filter(r => !hiddenStatuses.includes(r.status))
      .map(r => ({
        label: statusLabel(r.status), count: parseInt(r.count) || 0, color: getStatusColor(r.status)
      }));
    renderStackedBar('chart-status', statusSegments, { unit: 'rides' });
  } catch (e) { console.error('Analytics frequency error:', e); }
}

async function loadAnalyticsHotspots() {
  try {
    var data = await fetchHotspotsData();
    if (!data) return;
    if (data.topPickups) renderHotspotList('w-hotspot-pickups', data.topPickups, '', 'pickups');
    if (data.topDropoffs) renderHotspotList('w-hotspot-dropoffs', data.topDropoffs, 'darkgold', 'dropoffs');
    if (data.matrix) renderODMatrix('w-hotspot-matrix', data.matrix);
  } catch (e) { console.error('Analytics hotspots error:', e); }
}

async function loadFleetVehicles() {
  try {
    const res = await fetch('/api/analytics/vehicles' + getAnalyticsDateParams());
    if (!res.ok) return;
    fleetVehicles = await res.json();
    renderVehicleCards(fleetVehicles);
  } catch (e) { console.error('Analytics vehicles error:', e); }
}

async function loadAnalyticsMilestones() {
  try {
    var res = await fetch('/api/analytics/milestones');
    if (!res.ok) return;
    var data = await res.json();
    if (data.drivers) renderMilestoneList('w-driver-milestones', data.drivers, 'driver');
    if (data.riders) renderMilestoneList('w-rider-milestones', data.riders, 'rider');
  } catch (e) { console.error('Analytics milestones error:', e); }
}

async function loadSemesterReport() {
  try {
    const res = await fetch('/api/analytics/semester-report');
    if (!res.ok) return;
    renderSemesterReport(await res.json());
  } catch (e) { console.error('Semester report error:', e); }
}

async function loadTardinessAnalytics() {
  // Legacy wrapper — now delegates to the attendance widget system
  var data = await fetchTardinessData();
  if (!data) return;
  if (data.summary) renderAttendanceKPIs('att-kpis', data.summary);
  if (data.distribution) renderAttendanceDonut('att-donut', data.distribution);
  if (data.byDayOfWeek) renderTardinessDOW('att-dow', data.byDayOfWeek);
  if (data.dailyTrend) renderTardinessTrend('att-trend', data.dailyTrend);
  if (data.byDriver) renderPunctualityTable('att-punctuality', data.byDriver);
}

// ── Decomposed Attendance Render Functions ──

function renderAttendanceKPIs(containerId, summary) {
  var container = document.getElementById(containerId);
  if (!container || !summary) return;

  var onTimeRate = summary.totalClockIns > 0 ? Math.round((summary.onTimeCount / summary.totalClockIns) * 100) : 100;
  var onTimeClass = onTimeRate >= 90 ? 'kpi-card--good' : onTimeRate >= 80 ? 'kpi-card--warning' : 'kpi-card--danger';
  var tardyClass = summary.tardyCount === 0 ? 'kpi-card--good' : 'kpi-card--danger';
  var avgTardy = summary.avgTardinessMinutes ? parseFloat(summary.avgTardinessMinutes).toFixed(1) : '0';
  var ringColor = onTimeRate >= 90 ? 'var(--status-completed)' : onTimeRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
  var ringBg = 'var(--color-border-light)';
  var missedClass = (summary.totalMissedShifts || 0) === 0 ? 'kpi-card--good' : (summary.totalMissedShifts || 0) <= 3 ? 'kpi-card--warning' : 'kpi-card--danger';

  // KPI data is computed from server analytics — no user input in these values
  container.innerHTML =
    '<div class="kpi-card kpi-card--neutral"><div class="kpi-card__value">' + summary.totalClockIns + '</div><div class="kpi-card__label">Total Clock-Ins</div></div>' +
    '<div class="kpi-card ' + onTimeClass + '">' +
      '<div class="kpi-ring" style="background: conic-gradient(' + ringColor + ' ' + (onTimeRate * 3.6) + 'deg, ' + ringBg + ' ' + (onTimeRate * 3.6) + 'deg);">' +
        '<div class="kpi-ring__inner">' + onTimeRate + '%</div>' +
      '</div>' +
      '<div class="kpi-card__label">On-Time Rate</div>' +
    '</div>' +
    '<div class="kpi-card ' + tardyClass + '"><div class="kpi-card__value">' + summary.tardyCount + '</div><div class="kpi-card__label">Tardy Count</div></div>' +
    '<div class="kpi-card kpi-card--neutral"><div class="kpi-card__value">' + avgTardy + 'm</div><div class="kpi-card__label">Avg Tardiness</div></div>' +
    '<div class="kpi-card ' + missedClass + '"><div class="kpi-card__value">' + (summary.totalMissedShifts || 0) + '</div><div class="kpi-card__label">Missed Shifts</div></div>';
}

function renderAttendanceDonut(containerId, distribution) {
  var container = document.getElementById(containerId);
  if (!container) return;
  destroyChart(containerId);

  if (!distribution || !distribution.some(function(d) { return d.count > 0; })) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-donut-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No clock-in data available.</div></div>';
    return;
  }

  var donutColors = ['var(--status-completed)', 'var(--color-warning)', 'var(--status-on-the-way)', 'var(--color-warning-dark)', 'var(--status-no-show)'];
  var total = distribution.reduce(function(s, d) { return s + d.count; }, 0);
  var filtered = distribution.filter(function(d) { return d.count > 0; });

  // Build canvas container via DOM API
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';
  var canvas = document.createElement('canvas');
  canvas.id = containerId + '-canvas';
  wrapper.appendChild(canvas);
  container.textContent = '';
  container.appendChild(wrapper);

  var colors = filtered.map(function(d, i) {
    var origIdx = distribution.indexOf(d);
    return resolveColor(donutColors[origIdx]);
  });

  // Center text plugin
  var centerTextPlugin = {
    id: 'centerText_' + containerId,
    afterDraw: function(chart) {
      var w = chart.width, h = chart.height, c = chart.ctx;
      c.save();
      var fontSize = Math.min(w, h) * 0.1;
      c.font = '700 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      c.fillStyle = resolveColor('var(--color-text)');
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(total, w / 2, h / 2 - fontSize * 0.3);
      var subSize = fontSize * 0.45;
      c.font = '400 ' + subSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      c.fillStyle = resolveColor('var(--color-text-muted)');
      c.fillText('clock-ins', w / 2, h / 2 + fontSize * 0.5);
      c.restore();
    }
  };

  _chartInstances[containerId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: filtered.map(function(d) { return d.bucket; }),
      datasets: [{
        data: filtered.map(function(d) { return d.count; }),
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: resolveColor('var(--color-surface)'),
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              var pct = total > 0 ? Math.round(context.parsed / total * 100) : 0;
              return context.label + ': ' + context.parsed + ' clock-ins (' + pct + '% of total)';
            }
          }
        }
      }
    },
    plugins: [centerTextPlugin]
  });
}

async function renderTardinessDOW(containerId, byDayOfWeek) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!byDayOfWeek || !byDayOfWeek.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-calendar-off"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No tardiness data by day.</div></div>';
    return;
  }

  var dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var opsConfig2 = typeof getOpsConfig === 'function' ? await getOpsConfig() : null;
  var opDays2 = opsConfig2 && opsConfig2.operating_days
    ? String(opsConfig2.operating_days).split(',').map(Number)
    : [0, 1, 2, 3, 4, 5, 6];
  var tardyDowData = opDays2.map(function(d) {
    var pgDow = (d + 1) % 7;
    var found = byDayOfWeek.find(function(r) { return r.dayOfWeek === pgDow; });
    return { label: dayLabels[pgDow], count: found ? found.tardyCount : 0 };
  });
  renderColumnChart(containerId, tardyDowData, { color: 'var(--status-on-the-way)', unit: 'tardy clock-ins' });
}

function renderTardinessTrend(containerId, dailyTrend) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!dailyTrend || !dailyTrend.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-trending-up"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No trend data available.</div></div>';
    return;
  }

  var trendData = dailyTrend.map(function(d) {
    return {
      label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: d.tardyCount, raw: d
    };
  });
  renderLineChart(containerId, trendData, {
    color: 'var(--status-on-the-way)', fillOpacity: 0.12, unit: 'tardy',
    tooltipFn: function(raw) {
      var dateStr = new Date(raw.date + 'T12:00:00').toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
      var rate = raw.totalClockIns > 0 ? Math.round(raw.tardyCount / raw.totalClockIns * 100) : 0;
      return dateStr + ': ' + raw.tardyCount + ' tardy of ' + raw.totalClockIns + ' (' + rate + '%) \u00B7 Avg ' + (raw.avgTardinessMinutes || 0) + 'm';
    }
  });
}

function renderPunctualityTable(containerId, byDriver) {
  var container = document.getElementById(containerId);
  if (!container) return;

  if (!byDriver || !byDriver.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-clock-check"></i><div class="ro-empty__title">No data</div><div class="ro-empty__message">No clock-in data available for this period.</div></div>';
    return;
  }

  // Punctuality table data comes from server analytics — driver names from DB, not user input
  var html = '<div class="ro-table-wrap"><table class="ro-table"><thead><tr><th>Driver</th><th>Clock-Ins</th><th>Tardy</th><th>On-Time %</th><th>Avg Late</th><th>Max Late</th><th>Missed Shifts</th></tr></thead><tbody>';
  byDriver.forEach(function(d) {
    var driverOnTime = d.totalClockIns > 0 ? Math.round(((d.totalClockIns - d.tardyCount) / d.totalClockIns) * 100) : 100;
    var tardyPct = d.totalClockIns > 0 ? (d.tardyCount / d.totalClockIns * 100) : 0;
    var dotClass = d.tardyCount === 0 ? 'punctuality-dot--good' : tardyPct < 20 ? 'punctuality-dot--warning' : 'punctuality-dot--poor';
    var avg = d.avgTardinessMinutes ? parseFloat(d.avgTardinessMinutes).toFixed(1) + 'm' : '\u2014';
    var maxL = d.maxTardinessMinutes ? d.maxTardinessMinutes + 'm' : '\u2014';
    var barColor = driverOnTime >= 90 ? 'var(--status-completed)' : driverOnTime >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    var missedShifts = parseInt(d.missedShifts, 10) || 0;
    var missedBadge = missedShifts > 0
      ? '<span class="tardy-badge" style="background:var(--status-no-show)">' + missedShifts + '</span>'
      : '<span class="text-muted">\u2014</span>';
    html += '<tr>' +
      '<td><span class="punctuality-dot ' + dotClass + '"></span>' + d.name + '</td>' +
      '<td>' + d.totalClockIns + '</td>' +
      '<td>' + (d.tardyCount > 0 ? '<span class="tardy-badge">' + d.tardyCount + '</span>' : '<span class="text-muted">\u2014</span>') + '</td>' +
      '<td><div class="ontime-bar-cell"><div class="ontime-bar-track"><div class="ontime-bar-fill" style="width:' + driverOnTime + '%; background:' + barColor + ';"></div></div><span class="ontime-bar-label">' + driverOnTime + '%</span></div></td>' +
      '<td>' + avg + '</td>' +
      '<td>' + maxL + '</td>' +
      '<td>' + missedBadge + '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Make the table sortable
  var tbl = container.querySelector('.ro-table');
  if (tbl) makeSortable(tbl);
}

// ── New Analytics Data Loaders ──

async function loadRideVolume() {
  try {
    var res = await fetch('/api/analytics/ride-volume' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderRideVolumeChart(data);
  } catch (e) { console.error('Ride volume error:', e); }
}

async function loadRideOutcomes() {
  try {
    var res = await fetch('/api/analytics/ride-outcomes' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderDonutChart('chart-ride-outcomes', data.distribution);
  } catch (e) { console.error('Ride outcomes error:', e); }
}

async function loadPeakHours() {
  try {
    var res = await fetch('/api/analytics/peak-hours' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderPeakHoursHeatmap('chart-peak-hours', data);
  } catch (e) { console.error('Peak hours error:', e); }
}

async function loadTopRoutes() {
  try {
    var res = await fetch('/api/analytics/routes' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderTopRoutesTable('chart-top-routes', data.routes);
  } catch (e) { console.error('Top routes error:', e); }
}

async function loadDriverLeaderboard() {
  try {
    var res = await fetch('/api/analytics/driver-performance' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderDriverLeaderboard('chart-driver-leaderboard', data.drivers);
  } catch (e) { console.error('Driver leaderboard error:', e); }
}

async function loadShiftCoverage() {
  try {
    var res = await fetch('/api/analytics/shift-coverage' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderShiftCoverageChart('chart-shift-coverage', data);
  } catch (e) { console.error('Shift coverage error:', e); }
}

async function loadFleetUtilization() {
  try {
    var res = await fetch('/api/analytics/fleet-utilization' + getAnalyticsDateParams());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) { console.error('Fleet utilization error:', e); return null; }
}

async function loadRiderCohorts() {
  try {
    var res = await fetch('/api/analytics/rider-cohorts' + getAnalyticsDateParams());
    if (!res.ok) return;
    var data = await res.json();
    renderRiderCohorts('chart-rider-cohorts', data);
  } catch (e) { console.error('Rider cohorts error:', e); }
}

async function downloadExcelReport() {
  var btn = document.getElementById('download-excel-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Generating...'; }
  try {
    var qs = getAnalyticsDateParams();
    var res = await fetch('/api/analytics/export-report' + qs);
    if (!res.ok) { showToastNew('Failed to generate report', 'error'); return; }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var fromVal = document.getElementById('analytics-from') ? document.getElementById('analytics-from').value : 'report';
    var toVal = document.getElementById('analytics-to') ? document.getElementById('analytics-to').value : '';
    a.download = 'rideops-report-' + fromVal + '-to-' + toVal + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToastNew('Report downloaded successfully', 'success');
  } catch (e) {
    console.error('Export error:', e);
    showToastNew('Failed to download report', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-download"></i> Download .xlsx'; }
  }
}

// ── Report Preview ──

var REPORT_SHEETS = {
  full: {
    label: 'Full Report (All Sheets)',
    desc: 'Comprehensive export with all available data sheets.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Daily Volume', icon: 'ti-chart-bar', desc: 'Rides per day with status breakdown' },
      { name: 'Routes', icon: 'ti-route', desc: 'Top routes by frequency' },
      { name: 'Driver Performance', icon: 'ti-steering-wheel', desc: 'Per-driver rides, punctuality, hours' },
      { name: 'Rider Analysis', icon: 'ti-users', desc: 'Active, new, returning, and at-risk riders' },
      { name: 'Fleet', icon: 'ti-car', desc: 'Vehicle usage and maintenance' },
      { name: 'Shift Coverage', icon: 'ti-clock', desc: 'Scheduled vs actual driver-hours' },
      { name: 'Peak Hours', icon: 'ti-flame', desc: 'Day-of-week by hour heatmap' }
    ]
  },
  rides: {
    label: 'Rides Only',
    desc: 'Ride volume, daily trends, and popular routes.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Daily Volume', icon: 'ti-chart-bar', desc: 'Rides per day with status breakdown' },
      { name: 'Routes', icon: 'ti-route', desc: 'Top routes by frequency' }
    ]
  },
  drivers: {
    label: 'Driver Performance',
    desc: 'Driver scorecards and shift coverage analysis.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Driver Performance', icon: 'ti-steering-wheel', desc: 'Per-driver rides, punctuality, hours' },
      { name: 'Shift Coverage', icon: 'ti-clock', desc: 'Scheduled vs actual driver-hours' }
    ]
  },
  riders: {
    label: 'Rider Analysis',
    desc: 'Rider cohorts, activity, and engagement metrics.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Rider Analysis', icon: 'ti-users', desc: 'Active, new, returning, and at-risk riders' }
    ]
  },
  fleet: {
    label: 'Fleet Report',
    desc: 'Vehicle utilization and maintenance history.',
    sheets: [
      { name: 'Summary', icon: 'ti-list-details', desc: 'Aggregate KPIs and rates' },
      { name: 'Fleet', icon: 'ti-car', desc: 'Vehicle usage and maintenance' }
    ]
  }
};

function updateReportPreview(summaryData) {
  var container = document.getElementById('report-preview-table');
  if (!container) return;

  var sel = document.getElementById('report-type-select');
  var type = sel ? sel.value : 'full';
  var info = REPORT_SHEETS[type] || REPORT_SHEETS.full;

  // Date range display
  var fromEl = document.getElementById('analytics-from');
  var toEl = document.getElementById('analytics-to');
  var fromStr = fromEl ? fromEl.value : '';
  var toStr = toEl ? toEl.value : '';
  var dateLabel = '';
  function fmtShortDate(s) {
    if (!s) return '';
    var d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (fromStr && toStr) {
    dateLabel = fmtShortDate(fromStr) + ' \u2013 ' + fmtShortDate(toStr);
  } else if (fromStr) {
    dateLabel = 'From ' + fmtShortDate(fromStr);
  }

  // Build the sheets list
  var sheetsHtml = info.sheets.map(function(s) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;">' +
      '<i class="ti ' + s.icon + '" style="font-size:16px;color:var(--color-primary);opacity:0.7;width:20px;text-align:center;"></i>' +
      '<span style="font-weight:600;font-size:13px;min-width:130px;">' + s.name + '</span>' +
      '<span style="font-size:12px;color:var(--color-text-muted);">' + s.desc + '</span>' +
      '</div>';
  }).join('');

  // Build data summary if we have it
  var summaryHtml = '';
  if (summaryData) {
    var items = [
      { icon: 'ti-receipt', label: 'Rides', value: summaryData.totalRides },
      { icon: 'ti-circle-check', label: 'Completed', value: summaryData.completedRides },
      { icon: 'ti-steering-wheel', label: 'Drivers', value: summaryData.uniqueDrivers },
      { icon: 'ti-users', label: 'Riders', value: summaryData.uniqueRiders }
    ];
    summaryHtml = '<div style="display:flex;gap:16px;flex-wrap:wrap;padding:12px 16px;background:var(--color-surface-dim);border-radius:var(--radius-sm);margin-bottom:12px;">';
    items.forEach(function(item) {
      summaryHtml += '<div style="display:flex;align-items:center;gap:6px;">' +
        '<i class="ti ' + item.icon + '" style="font-size:14px;color:var(--color-text-muted);"></i>' +
        '<span style="font-size:13px;font-weight:700;">' + item.value + '</span>' +
        '<span style="font-size:12px;color:var(--color-text-muted);">' + item.label + '</span>' +
        '</div>';
    });
    summaryHtml += '</div>';
  } else if (analyticsReportData) {
    // Use cached data
    return updateReportPreview(analyticsReportData);
  }

  var html = '';

  // Data summary bar
  html += summaryHtml;

  // Description
  html += '<div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:10px;">' +
    '<i class="ti ti-info-circle" style="margin-right:4px;opacity:0.6;"></i>' +
    info.desc;
  if (dateLabel) {
    html += ' <span style="color:var(--color-text-muted);font-size:12px;">(' + dateLabel + ')</span>';
  }
  html += '</div>';

  // Sheets list
  html += '<div style="font-size:12px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Included Sheets (' + info.sheets.length + ')</div>';
  html += '<div style="border:1px solid var(--color-border-light);border-radius:var(--radius-sm);padding:4px 12px;">' + sheetsHtml + '</div>';

  container.innerHTML = html;

  // Cache summary data for dropdown changes
  if (summaryData) analyticsReportData = summaryData;
}

// ── New Chart Rendering Functions ──

function renderRideVolumeChart(data) {
  var containerId = 'chart-ride-volume';
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!data.data || !data.data.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-area-line"></i><div class="ro-empty__title">No ride data</div><div class="ro-empty__message">No rides found in this period.</div></div>';
    return;
  }
  var lineData = data.data.map(function(r) {
    return {
      label: new Date(r.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: r.total || 0,
      raw: r
    };
  });
  renderLineChart(containerId, lineData, {
    unit: 'rides',
    color: getCurrentCampusPalette()[0],
    tooltipFn: function(raw) {
      return raw.date + ': ' + raw.total + ' rides (' + raw.completed + ' completed, ' + raw.noShows + ' no-shows, ' + raw.cancelled + ' cancelled)';
    }
  });
}

function renderDonutChart(containerId, distribution) {
  var container = document.getElementById(containerId);
  if (!container) return;
  destroyChart(containerId);

  var items = [
    { label: 'Completed', value: distribution.completed || 0, color: 'var(--status-completed)' },
    { label: 'No-Shows', value: distribution.noShows || 0, color: 'var(--color-warning)' },
    { label: 'Cancelled', value: distribution.cancelled || 0, color: 'var(--status-cancelled)' },
    { label: 'Denied', value: distribution.denied || 0, color: 'var(--status-denied)' }
  ].filter(function(i) { return i.value > 0; });

  var total = items.reduce(function(s, i) { return s + i.value; }, 0);
  if (total === 0) {
    // Empty state — static developer-defined content, safe for innerHTML
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-chart-donut-3"></i><div class="ro-empty__title">No outcomes</div><div class="ro-empty__message">No terminal rides in this period.</div></div>';
    return;
  }

  // Build canvas container via DOM API
  var wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%;';
  var canvas = document.createElement('canvas');
  canvas.id = containerId + '-canvas';
  wrapper.appendChild(canvas);
  container.textContent = '';
  container.appendChild(wrapper);

  var colors = items.map(function(i) { return resolveColor(i.color); });

  // Center text plugin (inline, per-chart)
  var centerTextPlugin = {
    id: 'centerText_' + containerId,
    afterDraw: function(chart) {
      var w = chart.width, h = chart.height, c = chart.ctx;
      c.save();
      var fontSize = Math.min(w, h) * 0.12;
      c.font = '700 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      c.fillStyle = resolveColor('var(--color-text)');
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(total, w / 2, h / 2 - fontSize * 0.3);
      var subSize = fontSize * 0.45;
      c.font = '400 ' + subSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      c.fillStyle = resolveColor('var(--color-text-muted)');
      c.fillText('total rides', w / 2, h / 2 + fontSize * 0.5);
      c.restore();
    }
  };

  _chartInstances[containerId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: items.map(function(i) { return i.label; }),
      datasets: [{
        data: items.map(function(i) { return i.value; }),
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: resolveColor('var(--color-surface)'),
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              var pct = (context.parsed / total * 100).toFixed(1);
              return context.label + ': ' + context.parsed + ' rides (' + pct + '%)';
            }
          }
        }
      }
    },
    plugins: [centerTextPlugin]
  });
}

function renderPeakHoursHeatmap(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;

  var grid = data.grid || [];
  var maxCount = data.maxCount || 1;
  var opHours = data.operatingHours || { start: 8, end: 19 };
  var dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var palette = getCurrentCampusPalette();
  var baseColor = palette[0] || getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4682B4';

  // Resolve CSS variable to hex if needed
  if (baseColor.indexOf('var(') === 0) {
    baseColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#4682B4';
  }

  // Build lookup
  var lookup = {};
  grid.forEach(function(cell) { lookup[cell.dow + '-' + cell.hour] = cell.total; });

  var html = '<div style="overflow-x:auto;"><table style="border-collapse:separate;border-spacing:3px;width:100%;font-size:12px;">';
  html += '<thead><tr><th style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);text-align:left;">Hour</th>';
  dayLabels.forEach(function(d) { html += '<th style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);text-align:center;">' + d + '</th>'; });
  html += '</tr></thead><tbody>';

  for (var hour = opHours.start; hour < opHours.end; hour++) {
    var label = (hour > 12 ? hour - 12 : hour) + (hour >= 12 ? 'pm' : 'am');
    html += '<tr><td style="padding:4px 8px;font-size:11px;color:var(--color-text-muted);white-space:nowrap;font-weight:500;">' + label + '</td>';
    for (var dow = 1; dow <= 5; dow++) {
      var count = lookup[dow + '-' + hour] || 0;
      var intensity = maxCount > 0 ? count / maxCount : 0;
      var rr = parseInt(baseColor.slice(1, 3), 16);
      var gg = parseInt(baseColor.slice(3, 5), 16);
      var bb = parseInt(baseColor.slice(5, 7), 16);
      var bg = count > 0 ? 'rgba(' + rr + ', ' + gg + ', ' + bb + ', ' + Math.max(0.08, intensity * 0.85) + ')' : 'var(--color-surface-dim)';
      var textColor = intensity > 0.5 ? '#fff' : 'var(--color-text)';
      html += '<td style="padding:8px 4px;text-align:center;background:' + bg + ';color:' + textColor + ';border-radius:4px;font-weight:' + (count > 0 ? '600' : '400') + ';min-width:48px;cursor:default;" title="' + dayLabels[dow - 1] + ' ' + label + ': ' + count + ' rides">' + (count > 0 ? count : '\u2014') + '</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--color-text-muted);"><span>Low</span>';
  for (var i = 0; i < 5; i++) {
    var opacity = 0.08 + i * 0.2;
    var rr2 = parseInt(baseColor.slice(1, 3), 16);
    var gg2 = parseInt(baseColor.slice(3, 5), 16);
    var bb2 = parseInt(baseColor.slice(5, 7), 16);
    html += '<span style="display:inline-block;width:20px;height:14px;border-radius:3px;background:rgba(' + rr2 + ',' + gg2 + ',' + bb2 + ',' + opacity + ');"></span>';
  }
  html += '<span>High</span></div>';

  container.innerHTML = html;
}

function renderTopRoutesTable(containerId, routes) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!routes || !routes.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-route"></i><div class="ro-empty__title">No routes</div><div class="ro-empty__message">No route data for this period.</div></div>';
    return;
  }
  var top10 = routes.slice(0, 10);
  var html = '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Route</th><th style="text-align:right;">Rides</th><th style="text-align:right;">Completion</th></tr></thead><tbody>';
  top10.forEach(function(r) {
    var rateColor = r.completionRate >= 85 ? 'var(--status-completed)' : r.completionRate >= 70 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    html += '<tr><td style="font-size:12px;">' + escapeHtml(r.pickupLocation) + ' \u2192 ' + escapeHtml(r.dropoffLocation) + '</td><td style="text-align:right;font-weight:600;">' + r.total + '</td><td style="text-align:right;"><span style="color:' + rateColor + ';font-weight:600;">' + r.completionRate + '%</span></td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  makeSortable(container.querySelector('table'));
}

function renderDriverLeaderboard(containerId, drivers) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!drivers || !drivers.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-steering-wheel"></i><div class="ro-empty__title">No driver data</div><div class="ro-empty__message">No driver performance data for this period.</div></div>';
    return;
  }
  var sorted = drivers.slice().sort(function(a, b) { return b.completed - a.completed; });
  var html = '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Driver</th><th style="text-align:right;">Rides</th><th style="text-align:right;">Completion</th><th style="text-align:right;">On-Time</th></tr></thead><tbody>';
  sorted.forEach(function(d) {
    var compRate = d.completionRate || 0;
    var punctRate = d.punctualityRate || 100;
    var compColor = compRate >= 85 ? 'var(--status-completed)' : compRate >= 70 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    var punctColor = punctRate >= 90 ? 'var(--status-completed)' : punctRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';
    html += '<tr><td style="font-size:12px;">' + d.driverName + '</td><td style="text-align:right;font-weight:600;">' + d.completed + '</td><td style="text-align:right;"><span style="color:' + compColor + ';font-weight:600;">' + compRate + '%</span></td><td style="text-align:right;"><span style="color:' + punctColor + ';font-weight:600;">' + punctRate + '%</span></td></tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  makeSortable(container.querySelector('table'));
}

function renderShiftCoverageChart(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!data.daily || !data.daily.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-calendar-stats"></i><div class="ro-empty__title">No coverage data</div><div class="ro-empty__message">No shift coverage data for this period.</div></div>';
    return;
  }

  var totals = data.totals || {};
  var coverageRate = totals.coverageRate || 0;
  var coverageColor = coverageRate >= 95 ? 'var(--status-completed)' : coverageRate >= 80 ? 'var(--status-on-the-way)' : 'var(--status-no-show)';

  var html = '<div style="display:flex;gap:24px;margin-bottom:16px;flex-wrap:wrap;">' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;color:' + coverageColor + ';">' + coverageRate + '%</div><div style="font-size:11px;color:var(--color-text-muted);">Coverage Rate</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.scheduledHours || 0) + 'h</div><div style="font-size:11px;color:var(--color-text-muted);">Scheduled</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.actualHours || 0) + 'h</div><div style="font-size:11px;color:var(--color-text-muted);">Actual</div></div>' +
    '<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">' + (totals.totalCompletedRides || 0) + '</div><div style="font-size:11px;color:var(--color-text-muted);">Rides Completed</div></div>' +
  '</div>';

  html += '<table class="ro-table ro-table--sm" style="width:100%;"><thead><tr><th>Date</th><th style="text-align:right;">Scheduled</th><th style="text-align:right;">Actual</th><th style="text-align:right;">Gap</th><th style="text-align:right;">Rides</th></tr></thead><tbody>';
  data.daily.forEach(function(d) {
    var gapColor = d.gapHours < 0 ? 'var(--status-no-show)' : d.gapHours > 0 ? 'var(--status-completed)' : '';
    var gapText = d.gapHours > 0 ? '+' + d.gapHours + 'h' : d.gapHours + 'h';
    var dateStr = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    html += '<tr><td style="font-size:12px;">' + dateStr + '</td><td style="text-align:right;">' + d.scheduledHours + 'h</td><td style="text-align:right;">' + d.actualHours + 'h</td><td style="text-align:right;color:' + gapColor + ';font-weight:600;">' + gapText + '</td><td style="text-align:right;">' + d.completedRides + '</td></tr>';
  });
  html += '</tbody></table>';

  container.innerHTML = html;
}

function renderRiderCohorts(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var summary = data.summary || {};
  var items = [
    { label: 'Active', value: summary.active || 0, color: 'var(--status-completed)', icon: 'ti-user-check' },
    { label: 'New', value: summary.new || 0, color: 'var(--status-approved)', icon: 'ti-user-plus' },
    { label: 'Returning', value: summary.returning || 0, color: 'var(--color-primary)', icon: 'ti-refresh' },
    { label: 'At-Risk', value: summary.atRisk || 0, color: 'var(--status-on-the-way)', icon: 'ti-alert-triangle' },
    { label: 'Churned', value: summary.churned || 0, color: 'var(--color-text-muted)', icon: 'ti-user-minus' },
    { label: 'Terminated', value: summary.terminated || 0, color: 'var(--status-no-show)', icon: 'ti-ban' }
  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">';
  items.forEach(function(i) {
    html += '<div style="text-align:center;padding:12px;border-radius:8px;background:var(--color-surface-dim);">' +
      '<i class="ti ' + i.icon + '" style="font-size:20px;color:' + i.color + ';"></i>' +
      '<div style="font-size:20px;font-weight:700;color:' + i.color + ';margin:4px 0;">' + i.value + '</div>' +
      '<div style="font-size:11px;color:var(--color-text-muted);">' + i.label + '</div>' +
    '</div>';
  });
  html += '</div>';

  if (data.retentionRate !== undefined) {
    html += '<div style="margin-top:12px;text-align:center;font-size:12px;color:var(--color-text-muted);">Retention Rate: <strong>' + data.retentionRate + '%</strong></div>';
  }

  container.innerHTML = html;
}

function renderFleetUtilChart(containerId, data) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.vehicles || !data.vehicles.length) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-bus"></i><div class="ro-empty__title">No fleet data</div><div class="ro-empty__message">No vehicle data available.</div></div>';
    return;
  }
  var palette = getCurrentCampusPalette();
  var vehicles = data.vehicles.filter(function(v) { return v.status !== 'retired'; });
  var totalRides = vehicles.reduce(function(s, v) { return s + (v.totalRides || 0); }, 0);
  if (totalRides === 0) {
    container.innerHTML = '<div class="ro-empty"><i class="ti ti-bus"></i><div class="ro-empty__title">No vehicle assignments</div><div class="ro-empty__message">No vehicles were assigned to rides in this period. Assign vehicles to rides from the dispatch view.</div></div>';
    return;
  }
  var maxRides = Math.max.apply(null, vehicles.map(function(v) { return v.totalRides || 0; }).concat([1]));

  var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  vehicles.forEach(function(v, i) {
    var pct = maxRides > 0 ? ((v.totalRides || 0) / maxRides * 100) : 0;
    var color = palette[i % palette.length];
    var typeIcon = v.type === 'accessible' ? 'ti-wheelchair' : 'ti-car';
    html += '<div style="display:flex;align-items:center;gap:8px;">' +
      '<i class="ti ' + typeIcon + '" style="color:var(--color-text-muted);font-size:14px;width:16px;"></i>' +
      '<span style="font-size:12px;min-width:70px;white-space:nowrap;">' + v.name + '</span>' +
      '<div style="flex:1;background:var(--color-surface-dim);border-radius:4px;height:20px;overflow:hidden;">' +
        '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;transition:width 0.3s;"></div>' +
      '</div>' +
      '<span style="font-size:12px;font-weight:600;min-width:35px;text-align:right;">' + (v.totalRides || 0) + '</span>' +
    '</div>';
  });
  html += '</div>';

  if (data.summary) {
    html += '<div style="margin-top:12px;font-size:11px;color:var(--color-text-muted);">' + data.summary.totalFleet + ' vehicles total \u00B7 ' + data.summary.available + ' available \u00B7 ' + (data.summary.overdueCount || 0) + ' maintenance overdue</div>';
  }

  container.innerHTML = html;
}

// ── Dashboard Widget Loader ──

async function loadDashboardWidgets() {
  // Initialize or refresh dashboard widget system
  if (typeof initWidgetSystem === 'function') {
    var inst = _widgetInstances['dashboard'];
    if (!inst || !inst.userId) {
      initWidgetSystem(currentUser ? currentUser.id : 'default');
    } else {
      renderWidgetGrid('dashboard');
    }
  }

  // Helper: check if a container exists in the DOM (widget is visible)
  function has(id) { return !!document.getElementById(id); }

  // Show skeleton loading states for visible dashboard widgets
  if (has('analytics-kpi-grid')) showAnalyticsSkeleton('analytics-kpi-grid', 'kpi');
  if (has('chart-ride-volume')) showAnalyticsSkeleton('chart-ride-volume', 'chart');
  if (has('chart-ride-outcomes')) showAnalyticsSkeleton('chart-ride-outcomes', 'donut');
  if (has('chart-peak-hours')) showAnalyticsSkeleton('chart-peak-hours', 'heatmap');
  if (has('chart-dow')) showAnalyticsSkeleton('chart-dow', 'chart');
  if (has('chart-hour')) showAnalyticsSkeleton('chart-hour', 'chart');
  if (has('chart-top-routes')) showAnalyticsSkeleton('chart-top-routes', 'table');
  if (has('chart-driver-leaderboard')) showAnalyticsSkeleton('chart-driver-leaderboard', 'table');
  if (has('chart-shift-coverage')) showAnalyticsSkeleton('chart-shift-coverage', 'table');
  if (has('chart-fleet-util')) showAnalyticsSkeleton('chart-fleet-util', 'chart');
  if (has('chart-rider-cohorts')) showAnalyticsSkeleton('chart-rider-cohorts', 'chart');

  // Determine which shared data sources are needed
  var needKPI = has('analytics-kpi-grid');
  var needTardiness = needKPI;
  var needFleet = needKPI || has('chart-fleet-util');

  // Fetch KPI data sources first (in parallel)
  var results = await Promise.all([
    needKPI ? fetch('/api/analytics/summary' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }) : Promise.resolve(null),
    needTardiness ? fetchTardinessData() : Promise.resolve(null),
    needFleet ? fetch('/api/analytics/fleet-utilization' + getAnalyticsDateParams()).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }) : Promise.resolve(null)
  ]);

  var summaryData = results[0];
  var tardinessData = results[1];
  var fleetData = results[2];

  // Render KPIs from combined data
  if (summaryData && has('analytics-kpi-grid')) renderKPIGrid(summaryData, tardinessData, fleetData);

  // Update report preview with summary data
  updateReportPreview(summaryData);

  // Render fleet utilization chart (if visible in widget grid)
  if (fleetData && has('chart-fleet-util')) renderFleetUtilChart('chart-fleet-util', fleetData);

  // Load everything else in parallel — only for visible dashboard containers
  var loaders = [];
  if (has('chart-ride-volume')) loaders.push(loadRideVolume());
  if (has('chart-ride-outcomes')) loaders.push(loadRideOutcomes());
  if (has('chart-peak-hours')) loaders.push(loadPeakHours());
  if (has('chart-dow') || has('chart-hour')) loaders.push(loadAnalyticsFrequency());
  if (has('chart-top-routes')) loaders.push(loadTopRoutes());
  if (has('chart-driver-leaderboard')) loaders.push(loadDriverLeaderboard());
  if (has('chart-shift-coverage')) loaders.push(loadShiftCoverage());
  if (has('chart-rider-cohorts')) loaders.push(loadRiderCohorts());
  // Dashboard widget versions of hotspots/milestones (w- prefixed containers)
  if (has('w-hotspot-pickups') || has('w-hotspot-dropoffs') || has('w-hotspot-matrix')) loaders.push(loadAnalyticsHotspots());
  if (has('w-driver-milestones') || has('w-rider-milestones')) loaders.push(loadAnalyticsMilestones());

  await Promise.all(loaders);
}

// Backward-compatible alias
async function loadAllAnalytics() {
  return loadDashboardWidgets();
}

// ── Tab-Specific Widget Loaders ──

async function loadHotspotsWidgets() {
  initTabWidgets('hotspots', currentUser ? currentUser.id : 'default');
  var inst = _widgetInstances['hotspots'];
  if (!inst || !inst.layout) return;

  // Show skeletons
  var overrides = inst.config.containerOverrides || {};
  inst.layout.forEach(function(w) {
    var cid = overrides[w.id] || (WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null);
    if (cid && document.getElementById(cid)) {
      var sType = (w.id === 'route-demand-matrix') ? 'heatmap' : (w.id === 'hotspot-top-routes') ? 'table' : 'chart';
      showAnalyticsSkeleton(cid, sType);
    }
  });

  var data = await fetchHotspotsData();
  if (!data) return;
  inst.layout.forEach(function(w) {
    var cid = overrides[w.id] || (WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null);
    if (!cid || !document.getElementById(cid)) return;
    if (w.id === 'hotspot-pickups' && data.topPickups) renderHotspotList(cid, data.topPickups, '', 'pickups');
    if (w.id === 'hotspot-dropoffs' && data.topDropoffs) renderHotspotList(cid, data.topDropoffs, 'darkgold', 'dropoffs');
    if (w.id === 'route-demand-matrix' && data.matrix) renderODMatrix(cid, data.matrix);
    if (w.id === 'hotspot-top-routes' && data.topRoutes) renderHotspotList(cid, data.topRoutes, '', 'routes');
  });
}

async function loadMilestonesWidgets() {
  initTabWidgets('milestones', currentUser ? currentUser.id : 'default');
  var inst = _widgetInstances['milestones'];
  if (!inst || !inst.layout) return;

  // Show skeletons
  var overrides = inst.config.containerOverrides || {};
  inst.layout.forEach(function(w) {
    var cid = overrides[w.id] || (WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null);
    if (cid && document.getElementById(cid)) showAnalyticsSkeleton(cid, 'chart');
  });

  try {
    var res = await fetch('/api/analytics/milestones');
    if (!res.ok) return;
    var data = await res.json();
    inst.layout.forEach(function(w) {
      var cid = overrides[w.id] || (WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null);
      if (!cid || !document.getElementById(cid)) return;
      if (w.id === 'driver-milestones' && data.drivers) renderMilestoneList(cid, data.drivers, 'driver');
      if (w.id === 'rider-milestones' && data.riders) renderMilestoneList(cid, data.riders, 'rider');
    });
  } catch (e) { console.error('Milestones tab error:', e); }
}

async function loadAttendanceWidgets() {
  initTabWidgets('attendance', currentUser ? currentUser.id : 'default');
  var inst = _widgetInstances['attendance'];
  if (!inst || !inst.layout) return;

  // Show skeletons
  inst.layout.forEach(function(w) {
    var cid = WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null;
    if (!cid || !document.getElementById(cid)) return;
    var sType = 'chart';
    if (w.id === 'attendance-kpis') sType = 'kpi';
    else if (w.id === 'attendance-donut') sType = 'donut';
    else if (w.id === 'punctuality-table') sType = 'table';
    showAnalyticsSkeleton(cid, sType);
  });

  var data = await fetchTardinessData();
  if (!data) return;
  inst.layout.forEach(function(w) {
    var cid = WIDGET_REGISTRY[w.id] ? WIDGET_REGISTRY[w.id].containerId : null;
    if (!cid || !document.getElementById(cid)) return;
    if (w.id === 'attendance-kpis' && data.summary) renderAttendanceKPIs(cid, data.summary);
    if (w.id === 'attendance-donut' && data.distribution) renderAttendanceDonut(cid, data.distribution);
    if (w.id === 'tardiness-by-dow' && data.byDayOfWeek) renderTardinessDOW(cid, data.byDayOfWeek);
    if (w.id === 'tardiness-trend' && data.dailyTrend) renderTardinessTrend(cid, data.dailyTrend);
    if (w.id === 'punctuality-table' && data.byDriver) renderPunctualityTable(cid, data.byDriver);
  });
}
