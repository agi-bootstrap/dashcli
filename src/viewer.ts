import type { DashboardSpec, ChartSpec, FilterSpec } from "./schema";

export function renderDashboardHtml(spec: DashboardSpec): string {
  const gridCols = spec.layout.columns;

  // Calculate max row from chart positions
  const maxRow = spec.charts.reduce((max, c) => Math.max(max, c.position[1] + c.position[3]), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(spec.title)} — dashcli</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"></script>
<style>
:root {
  --sp: 4px;
  --bg: #fafafa;
  --surface: #ffffff;
  --border: #e2e2e2;
  --text: #1a1a1a;
  --text-secondary: #6b6b6b;
  --text-muted: #737373;
  --accent: #2563eb;
  --green: #16a34a;
  --red: #dc2626;
  --border-light: #f0f0f0;
  --hover: #f8f9fa;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--sp) * 4) calc(var(--sp) * 6);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.header h1 { font-size: 22px; font-weight: 600; line-height: 1.2; text-wrap: balance; }
.header .subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  font-family: "SF Mono", "Fira Code", ui-monospace, monospace;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: calc(var(--sp) * 3);
  row-gap: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 3) calc(var(--sp) * 6);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.filter-group { display: flex; align-items: center; gap: calc(var(--sp) * 2); }
.filter-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
.filter-input {
  border: 1px solid var(--border);
  border-radius: calc(var(--sp) * 1);
  padding: calc(var(--sp) * 3);
  font-size: 13px;
  min-height: 44px;
  background: var(--surface);
  color: var(--text);
  outline: none;
  transition: border-color 150ms ease;
}
select.filter-input { cursor: pointer; }
.filter-input:focus { border-color: var(--accent); }
.filter-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.filter-sep { color: var(--text-muted); font-size: 12px; }
select.filter-input[multiple] { min-height: 44px; max-height: 88px; }

/* Dashboard grid */
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(${gridCols}, 1fr);
  grid-template-rows: repeat(${maxRow}, minmax(200px, auto));
  gap: calc(var(--sp) * 4);
  padding: calc(var(--sp) * 6);
  max-width: 1440px;
  margin: 0 auto;
}
.header, .filter-bar {
  padding-left: max(calc(var(--sp) * 6), calc((100% - 1392px) / 2));
  padding-right: max(calc(var(--sp) * 6), calc((100% - 1392px) / 2));
}

/* Cards */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: calc(var(--sp) * 2);
  padding: calc(var(--sp) * 4);
  display: flex;
  flex-direction: column;
}
.card-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: calc(var(--sp) * 3);
}
.chart-container { flex: 1; min-height: 180px; }

/* KPI */
.kpi-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-top: calc(var(--sp) * 8);
  font-variant-numeric: tabular-nums;
}

/* Table */
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.data-table th {
  text-align: left;
  padding: calc(var(--sp) * 2);
  border-bottom: 2px solid var(--border);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}
.data-table td {
  padding: calc(var(--sp) * 2);
  border-bottom: 1px solid var(--border-light);
  color: var(--text-secondary);
}
.data-table th.num, .data-table td.num { text-align: right; }
.data-table tbody tr { transition: background-color 150ms ease; }
.data-table tbody tr:hover { background: var(--hover); }
.table-overflow { text-align: center; padding: calc(var(--sp) * 2); color: var(--text-muted); font-size: 12px; }

/* Loading / Error states */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
}
.dashcli-column-warning {
  position: absolute;
  top: 0; left: 0; right: 0;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  padding: calc(var(--sp) * 1) calc(var(--sp) * 2);
  z-index: 10;
  border-radius: calc(var(--sp) * 1) calc(var(--sp) * 1) 0 0;
}
.chart-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--red);
  font-size: 13px;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .filter-bar { flex-wrap: wrap; }
  .dashboard-grid {
    grid-template-columns: 1fr !important;
    grid-template-rows: auto !important;
  }
  .dashboard-grid > .card {
    grid-column: 1 / -1 !important;
    grid-row: auto !important;
  }
  .data-table { font-size: 12px; }
  .kpi-value { font-size: 28px; margin-top: calc(var(--sp) * 2); }
  .card:has(.kpi-value) .chart-container { min-height: auto; }
}
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>${escHtml(spec.title)}</h1>
    <div class="subtitle">dashcli &middot; ${escHtml(spec.name)}.yaml</div>
  </div>
</div>

${renderFilterBar(spec.filters)}

<div class="dashboard-grid">
${spec.charts.map((chart) => renderChartCard(chart)).join("\n")}
</div>

<script>
const SPEC = ${JSON.stringify(spec).replace(/</g, '\\u003c')};

echarts.registerTheme('dashcli', {
  color: ['#2563eb', 'rgba(37,99,235,0.7)', 'rgba(37,99,235,0.5)', 'rgba(37,99,235,0.35)', 'rgba(37,99,235,0.2)', '#60a5fa', '#93c5fd'],
  grid: { left: 16, right: 16, top: 16, bottom: 32, containLabel: true },
  categoryAxis: {
    axisLabel: { fontSize: 11, color: '#737373' },
    axisLine: { lineStyle: { color: '#e2e2e2' } },
    axisTick: { show: false }
  },
  valueAxis: {
    axisLabel: { fontSize: 11, color: '#737373' },
    axisLine: { show: false },
    splitLine: { lineStyle: { color: '#f0f0f0' } } /* matches --border-light */
  },
  bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } },
  line: { lineStyle: { width: 2.5 }, smooth: true, symbol: 'circle', symbolSize: 6 },
  pie: { itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, label: { fontSize: 11, color: '#737373' } },
  scatter: { symbolSize: 8 },
  gauge: {
    axisLine: { lineStyle: { width: 12, color: [[1, '#2563eb']] } },
    axisTick: { show: false },
    splitLine: { length: 8, lineStyle: { color: '#e2e2e2' } },
    axisLabel: { fontSize: 11, color: '#737373' }
  },
  heatmap: { itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 2 } },
  funnel: { itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, label: { fontSize: 11, color: '#737373' } },
  legend: { textStyle: { fontSize: 11, color: '#737373' } }
});

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getFilterValues() {
  const vals = {};
  for (const f of SPEC.filters) {
    if (f.type === 'date_range') {
      const start = document.getElementById('filter-' + f.id + '-start')?.value;
      const end = document.getElementById('filter-' + f.id + '-end')?.value;
      vals[f.id] = start + ',' + end;
    } else if (f.type === 'dropdown') {
      vals[f.id] = document.getElementById('filter-' + f.id)?.value || 'all';
    } else if (f.type === 'multi_select') {
      const select = document.getElementById('filter-' + f.id);
      if (select) {
        vals[f.id] = Array.from(select.selectedOptions).map(function(o) { return o.value; });
      } else {
        vals[f.id] = [];
      }
    } else if (f.type === 'range') {
      const min = document.getElementById('filter-' + f.id + '-min')?.value || '';
      const max = document.getElementById('filter-' + f.id + '-max')?.value || '';
      vals[f.id] = min + ',' + max;
    } else if (f.type === 'text') {
      vals[f.id] = document.getElementById('filter-' + f.id)?.value || '';
    }
  }
  return vals;
}

function buildQueryString(filters) {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(filters)) {
    if (Array.isArray(val)) {
      for (const v of val) params.append(key, v);
    } else {
      params.set(key, val);
    }
  }
  return params.toString();
}

async function fetchChartData(chartId) {
  const filters = getFilterValues();
  const qs = buildQueryString(filters);
  const res = await fetch('/api/data/' + SPEC.name + '/' + chartId + '?' + qs);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Query failed');
  }
  return res.json();
}

function formatValue(val, format) {
  if (val == null) return '—';
  if (format === 'currency') {
    const n = Number(val);
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  }
  if (format === 'percent') return Number(val).toFixed(1) + '%';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
}

const chartInstances = {};
const chartObservers = {};

async function renderChart(chart) {
  var container = document.getElementById('chart-' + chart.id);
  if (!container) return;

  if (chart.type === 'custom' && chartInstances[chart.id]) {
    chartInstances[chart.id].showLoading();
  } else {
    container.innerHTML = '<div class="chart-loading">Loading...</div>';
  }

  try {
    var data = await fetchChartData(chart.id);

    if (chart.type === 'kpi') {
      renderKpi(container, chart, data);
    } else if (chart.type === 'table') {
      renderTable(container, chart, data);
    } else {
      // type: custom — the only ECharts path
      if (!chart.option) {
        container.innerHTML = '<div class="chart-error">Missing option</div>';
        return;
      }
      if (!data.length) {
        if (chartInstances[chart.id]) {
          chartInstances[chart.id].dispose();
          delete chartInstances[chart.id];
          if (chartObservers[chart.id]) { chartObservers[chart.id].disconnect(); delete chartObservers[chart.id]; }
        }
        container.innerHTML = '<div class="chart-loading">No data</div>';
        return;
      }
      var warnings = [];
      var option = resolveDataBindings(chart.option, data, warnings);
      if (warnings.length) {
        console.warn('[dashcli] Chart "' + chart.id + '" column warnings:', warnings);
      }
      renderEChartsOption(container, chart.id, option, warnings);
    }
  } catch (err) {
    if (chartInstances[chart.id]) {
      chartInstances[chart.id].dispose();
      delete chartInstances[chart.id];
      if (chartObservers[chart.id]) { chartObservers[chart.id].disconnect(); delete chartObservers[chart.id]; }
    }
    container.innerHTML = '<div class="chart-error">' + esc(String(err.message)) + '</div>';
  }
}

function renderKpi(container, chart, data) {
  const row = data[0] || {};
  const val = row.value ?? row[Object.keys(row)[0]];
  container.innerHTML = '<div class="kpi-value">' + esc(formatValue(val, chart.format)) + '</div>';
}

function renderTable(container, chart, data) {
  if (!data.length) {
    container.innerHTML = '<div class="chart-loading">No data</div>';
    return;
  }
  const cols = Object.keys(data[0]);
  // Detect numeric columns from first row
  const numCols = new Set();
  for (const col of cols) {
    const v = data[0][col];
    if (typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v)))) numCols.add(col);
  }
  let html = '<table class="data-table"><thead><tr>';
  for (const col of cols) html += '<th' + (numCols.has(col) ? ' class="num"' : '') + '>' + esc(col.replace(/_/g, ' ')) + '</th>';
  html += '</tr></thead><tbody>';
  for (const row of data.slice(0, 50)) {
    html += '<tr>';
    for (const col of cols) {
      const v = row[col];
      const isNum = numCols.has(col);
      html += '<td' + (isNum ? ' class="num"' : '') + '>' + (isNum ? (v == null ? '' : Number(v).toLocaleString()) : esc(v ?? '')) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  if (data.length > 50) html += '<div class="table-overflow">Showing 50 of ' + data.length + ' rows</div>';
  container.innerHTML = html;
}

function resolveDataBindings(obj, data, warnings) {
  if (typeof obj === 'string') {
    if (obj === '$rows') return data;
    if (obj.startsWith('$rows.')) {
      var col = obj.slice(6);
      if (data.length && !(col in data[0])) {
        warnings.push('Column "' + col + '" not found in data. Available: ' + Object.keys(data[0]).join(', '));
      }
      return data.map(function(r) { return r[col]; });
    }
    if (obj.startsWith('$row0.')) {
      var col = obj.slice(6);
      if (data.length && !(col in data[0])) {
        warnings.push('Column "' + col + '" not found in data. Available: ' + Object.keys(data[0]).join(', '));
      }
      return data[0] ? data[0][col] : null;
    }
    if (obj.startsWith('$distinct.')) {
      var col = obj.slice(10);
      if (data.length && !(col in data[0])) {
        warnings.push('Column "' + col + '" not found in data. Available: ' + Object.keys(data[0]).join(', '));
      }
      var seen = {};
      var result = [];
      for (var i = 0; i < data.length; i++) {
        var v = data[i][col];
        if (!seen[v]) { seen[v] = true; result.push(v); }
      }
      return result;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(function(item) { return resolveDataBindings(item, data, warnings); });
  }
  if (obj !== null && typeof obj === 'object') {
    var out = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        out[key] = resolveDataBindings(obj[key], data, warnings);
      }
    }
    return out;
  }
  return obj;
}

function renderEChartsOption(container, chartId, option, warnings) {
  // Remove stale warning banner from previous render
  var oldBanner = container.querySelector('.dashcli-column-warning');
  if (oldBanner) oldBanner.remove();

  var instance = chartInstances[chartId];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container, 'dashcli');
    chartInstances[chartId] = instance;
    var ro = new ResizeObserver(function() { instance.resize(); });
    ro.observe(container);
    chartObservers[chartId] = ro;
  }

  try {
    instance.setOption(option, true);
  } catch (e) {
    container.innerHTML = '<div class="chart-error">ECharts error: ' + esc(String(e.message)) + '</div>';
    if (chartInstances[chartId]) {
      chartInstances[chartId].dispose();
      delete chartInstances[chartId];
      if (chartObservers[chartId]) { chartObservers[chartId].disconnect(); delete chartObservers[chartId]; }
    }
    return;
  }
  instance.hideLoading();

  if (warnings && warnings.length) {
    var banner = document.createElement('div');
    banner.className = 'dashcli-column-warning';
    banner.textContent = 'Warning: ' + warnings.join('; ');
    container.style.position = 'relative';
    container.appendChild(banner);
  }
}

async function loadAll() {
  await Promise.all(SPEC.charts.map(c => renderChart(c)));
}

// Filter change handler (debounced to prevent rapid-fire requests)
let _filterTimer;
document.querySelectorAll('.filter-input').forEach(el => {
  el.addEventListener('change', () => {
    clearTimeout(_filterTimer);
    _filterTimer = setTimeout(() => loadAll(), 150);
  });
});

// Populate dropdown filters from API
async function populateDropdowns() {
  try {
    const res = await fetch('/api/filters/' + SPEC.name);
    if (!res.ok) return;
    const values = await res.json();
    for (const [filterId, options] of Object.entries(values)) {
      const select = document.getElementById('filter-' + filterId);
      if (!select || select.tagName !== 'SELECT') continue;
      for (const opt of options) {
        const el = document.createElement('option');
        el.value = opt;
        el.textContent = opt;
        select.appendChild(el);
      }
    }
    // Also listen for input events on text/number filters
    document.querySelectorAll('input.filter-input[type="text"], input.filter-input[type="number"]').forEach(function(el) {
      el.addEventListener('input', function() {
        clearTimeout(_filterTimer);
        _filterTimer = setTimeout(function() { loadAll(); }, 150);
      });
    });
  } catch {}
}

// Initial load
populateDropdowns().then(() => loadAll());

// Live reload via Server-Sent Events
if (window.location.protocol !== 'file:') {
  const _evtSource = new EventSource('/api/events/' + SPEC.name);
  _evtSource.onmessage = function(event) {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'data-change') {
        loadAll();
      } else if (msg.type === 'spec-change') {
        window.location.reload();
      }
    } catch(e) { console.warn('SSE parse error:', e); }
  };
}
</script>
</body>
</html>`;
}

function renderFilterBar(filters: FilterSpec[]): string {
  if (!filters.length) return "";

  const groups = filters.map((f) => {
    const labelText = escHtml(f.id.replace(/_/g, " "));
    if (f.type === "date_range") {
      const [start, end] = Array.isArray(f.default) ? f.default : ["", ""];
      return `<div class="filter-group">
  <label class="filter-label" for="filter-${escHtml(f.id)}-start">${labelText}</label>
  <input type="date" class="filter-input" id="filter-${escHtml(f.id)}-start" value="${escHtml(start)}" aria-label="${labelText} start">
  <span class="filter-sep">&rarr;</span>
  <input type="date" class="filter-input" id="filter-${escHtml(f.id)}-end" value="${escHtml(end)}" aria-label="${labelText} end">
</div>`;
    } else if (f.type === "multi_select") {
      return `<div class="filter-group">
  <label class="filter-label" for="filter-${escHtml(f.id)}">${labelText}</label>
  <select class="filter-input" id="filter-${escHtml(f.id)}" multiple aria-label="${labelText}">
  </select>
</div>`;
    } else if (f.type === "range") {
      const defaults = Array.isArray(f.default) ? f.default : [0, 100];
      return `<div class="filter-group">
  <label class="filter-label" for="filter-${escHtml(f.id)}-min">${labelText}</label>
  <input type="number" class="filter-input" id="filter-${escHtml(f.id)}-min" value="${escHtml(String(defaults[0]))}" aria-label="${labelText} min">
  <span class="filter-sep">&rarr;</span>
  <input type="number" class="filter-input" id="filter-${escHtml(f.id)}-max" value="${escHtml(String(defaults[1]))}" aria-label="${labelText} max">
</div>`;
    } else if (f.type === "text") {
      const defaultVal = typeof f.default === "string" ? f.default : "";
      return `<div class="filter-group">
  <label class="filter-label" for="filter-${escHtml(f.id)}">${labelText}</label>
  <input type="text" class="filter-input" id="filter-${escHtml(f.id)}" value="${escHtml(defaultVal)}" placeholder="Search..." aria-label="${labelText}">
</div>`;
    } else {
      return `<div class="filter-group">
  <label class="filter-label" for="filter-${escHtml(f.id)}">${labelText}</label>
  <select class="filter-input" id="filter-${escHtml(f.id)}">
    <option value="all">All</option>
  </select>
</div>`;
    }
  });

  return `<div class="filter-bar">${groups.join("\n")}</div>`;
}

function renderChartCard(chart: ChartSpec): string {
  const [colStart, rowStart, colSpan, rowSpan] = chart.position;
  const style = `grid-column: ${colStart + 1} / span ${colSpan}; grid-row: ${rowStart + 1} / span ${rowSpan};`;
  const label = chart.label || chart.id.replace(/_/g, " ");

  return `<div class="card" style="${style}">
  <div class="card-title">${escHtml(label)}</div>
  <div class="chart-container" id="chart-${escHtml(chart.id)}"></div>
</div>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
