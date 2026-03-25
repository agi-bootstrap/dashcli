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
.header h1 { font-size: 22px; font-weight: 600; line-height: 1.2; }
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
  padding: calc(var(--sp) * 2.5) calc(var(--sp) * 2.5);
  font-size: 13px;
  min-height: 44px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}
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
.header, .filter-bar { max-width: 1440px; margin-left: auto; margin-right: auto; }

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
  border-bottom: 1px solid #f0f0f0;
  color: var(--text-secondary);
}
.data-table th.num, .data-table td.num { text-align: right; }
.data-table tbody tr:hover { background: #f8f9fa; }

/* Loading / Error states */
.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 13px;
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

async function renderChart(chart) {
  const container = document.getElementById('chart-' + chart.id);
  if (!container) return;

  // For ECharts types, show loading on existing instance or set placeholder
  if (['bar','line','pie','scatter','gauge','area','stacked_bar','heatmap','funnel'].includes(chart.type) && chartInstances[chart.id]) {
    chartInstances[chart.id].showLoading();
  } else {
    container.innerHTML = '<div class="chart-loading">Loading...</div>';
  }

  try {
    const data = await fetchChartData(chart.id);

    if (chart.type === 'kpi') {
      renderKpi(container, chart, data);
    } else if (chart.type === 'table') {
      renderTable(container, chart, data);
    } else if (chart.type === 'pie') {
      renderPieChart(container, chart, data);
    } else if (chart.type === 'scatter') {
      renderScatterChart(container, chart, data);
    } else if (chart.type === 'gauge') {
      renderGaugeChart(container, chart, data);
    } else if (chart.type === 'bar' || chart.type === 'line' || chart.type === 'area') {
      renderEChart(container, chart, data);
    } else if (chart.type === 'stacked_bar') {
      renderStackedBarChart(container, chart, data);
    } else if (chart.type === 'heatmap') {
      renderHeatmapChart(container, chart, data);
    } else if (chart.type === 'funnel') {
      renderFunnelChart(container, chart, data);
    }
  } catch (err) {
    if (chartInstances[chart.id]) {
      chartInstances[chart.id].dispose();
      delete chartInstances[chart.id];
    }
    const msg = String(err.message).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    container.innerHTML = '<div class="chart-error">' + msg + '</div>';
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
  if (data.length > 50) html += '<div style="text-align:center;padding:8px;color:#737373;font-size:12px;">Showing 50 of ' + data.length + ' rows</div>';
  container.innerHTML = html;
}

function renderEChart(container, chart, data) {
  if (!data.length) {
    if (chartInstances[chart.id]) {
      chartInstances[chart.id].dispose();
      delete chartInstances[chart.id];
    }
    container.innerHTML = '<div class="chart-loading">No data</div>';
    return;
  }

  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const xData = data.map(r => r[chart.x]);
  const yData = data.map(r => Number(r[chart.y]));

  instance.setOption({
    tooltip: { trigger: chart.type === 'bar' ? 'axis' : 'item' },
    grid: { left: 16, right: 16, top: 16, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { lineStyle: { color: '#e2e2e2' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: chart.type === 'area' ? 'line' : chart.type,
      data: yData,
      itemStyle: { color: '#2563eb', borderRadius: chart.type === 'bar' ? [4, 4, 0, 0] : undefined },
      lineStyle: (chart.type === 'line' || chart.type === 'area') ? { width: 2.5, color: '#2563eb' } : undefined,
      areaStyle: chart.type === 'area' ? { color: 'rgba(37, 99, 235, 0.15)' } : undefined,
      smooth: chart.type === 'line' || chart.type === 'area',
      symbol: (chart.type === 'line' || chart.type === 'area') ? 'circle' : undefined,
      symbolSize: (chart.type === 'line' || chart.type === 'area') ? 6 : undefined,
    }],
  }, true); // true = notMerge, replace entire option

  instance.hideLoading();
}

function renderPieChart(container, chart, data) {
  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const pieData = data.map((r, i) => {
    const total = data.length;
    const opacity = 1 - (i / total) * 0.6;
    return {
      name: String(r[chart.x]),
      value: Number(r[chart.y]),
      itemStyle: { color: 'rgba(37, 99, 235, ' + opacity + ')' },
    };
  });

  instance.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '50%'],
      data: pieData,
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      label: { fontSize: 11, color: '#737373' },
      emphasis: { itemStyle: { shadowBlur: 0 } },
    }],
  }, true);

  instance.hideLoading();
}

function renderScatterChart(container, chart, data) {
  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const scatterData = data.map(r => [Number(r[chart.x]), Number(r[chart.y])]);

  instance.setOption({
    tooltip: { trigger: 'item', formatter: function(p) { return chart.x + ': ' + Number(p.value[0]).toLocaleString() + '<br>' + chart.y + ': ' + Number(p.value[1]).toLocaleString(); } },
    grid: { left: 16, right: 16, top: 16, bottom: 32, containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { lineStyle: { color: '#e2e2e2' } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [{
      type: 'scatter',
      data: scatterData,
      symbolSize: 8,
      itemStyle: { color: '#2563eb' },
    }],
  }, true);

  instance.hideLoading();
}

function renderGaugeChart(container, chart, data) {
  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const row = data[0] || {};
  const val = Number(row.value ?? row[Object.keys(row)[0]]);
  const minVal = chart.min != null ? chart.min : 0;
  const maxVal = chart.max != null ? chart.max : 100;

  instance.setOption({
    series: [{
      type: 'gauge',
      min: minVal,
      max: maxVal,
      data: [{ value: val }],
      axisLine: { lineStyle: { width: 12, color: [[1, '#2563eb']] } },
      axisTick: { show: false },
      splitLine: { length: 8, lineStyle: { color: '#e2e2e2' } },
      axisLabel: { fontSize: 11, color: '#737373' },
      pointer: { width: 4, length: '60%', itemStyle: { color: '#1a1a1a' } },
      detail: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', offsetCenter: [0, '70%'], formatter: function(v) { return formatValue(v, chart.format); } },
      title: { show: false },
    }],
  }, true);

  instance.hideLoading();
}

function renderStackedBarChart(container, chart, data) {
  if (!data.length) {
    if (chartInstances[chart.id]) { chartInstances[chart.id].dispose(); delete chartInstances[chart.id]; }
    container.innerHTML = '<div class="chart-loading">No data</div>';
    return;
  }

  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const xValues = [];
  const groupSet = new Set();
  for (const r of data) {
    if (xValues.indexOf(r[chart.x]) === -1) xValues.push(r[chart.x]);
    groupSet.add(r[chart.group]);
  }
  const groups = Array.from(groupSet);

  const series = groups.map(function(g, i) {
    var opacity = groups.length <= 1 ? 1 : 1 - (i / (groups.length - 1)) * 0.7;
    var groupData = xValues.map(function(x) {
      var row = data.find(function(r) { return r[chart.x] === x && r[chart.group] === g; });
      return row ? Number(row[chart.y]) : 0;
    });
    return {
      name: String(g),
      type: 'bar',
      stack: 'total',
      data: groupData,
      itemStyle: { color: 'rgba(37, 99, 235, ' + opacity + ')', borderRadius: [0, 0, 0, 0] },
    };
  });
  if (series.length) series[series.length - 1].itemStyle.borderRadius = [4, 4, 0, 0];

  var showLegend = groups.length <= 8;
  instance.setOption({
    tooltip: { trigger: 'axis' },
    legend: { show: showLegend, bottom: 0, textStyle: { fontSize: 11, color: '#737373' } },
    grid: { left: 16, right: 16, top: 16, bottom: showLegend ? 48 : 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: xValues,
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { lineStyle: { color: '#e2e2e2' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: series,
  }, true);

  instance.hideLoading();
}

function renderHeatmapChart(container, chart, data) {
  if (!data.length) {
    if (chartInstances[chart.id]) { chartInstances[chart.id].dispose(); delete chartInstances[chart.id]; }
    container.innerHTML = '<div class="chart-loading">No data</div>';
    return;
  }

  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const xValues = [];
  const yValues = [];
  for (const r of data) {
    if (xValues.indexOf(r[chart.x]) === -1) xValues.push(r[chart.x]);
    if (yValues.indexOf(r[chart.y]) === -1) yValues.push(r[chart.y]);
  }

  const heatData = data.map(function(r) {
    return [xValues.indexOf(r[chart.x]), yValues.indexOf(r[chart.y]), Number(r[chart.value])];
  });
  const maxVal = heatData.reduce(function(m, d) { return Math.max(m, d[2]); }, 0) || 1;

  instance.setOption({
    tooltip: {
      formatter: function(p) {
        return esc(String(xValues[p.value[0]])) + ' / ' + esc(String(yValues[p.value[1]])) + ': ' + Number(p.value[2]).toLocaleString();
      }
    },
    grid: { left: 16, right: 16, top: 16, bottom: 32, containLabel: true },
    xAxis: {
      type: 'category',
      data: xValues,
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { lineStyle: { color: '#e2e2e2' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'category',
      data: yValues,
      axisLabel: { fontSize: 11, color: '#737373' },
      axisLine: { show: false },
    },
    visualMap: {
      min: 0,
      max: maxVal,
      inRange: { color: ['#f0f4ff', '#2563eb'] },
      show: false,
    },
    series: [{
      type: 'heatmap',
      data: heatData,
      label: { show: false },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 2 },
    }],
  }, true);

  instance.hideLoading();
}

function renderFunnelChart(container, chart, data) {
  if (!data.length) {
    if (chartInstances[chart.id]) { chartInstances[chart.id].dispose(); delete chartInstances[chart.id]; }
    container.innerHTML = '<div class="chart-loading">No data</div>';
    return;
  }

  let instance = chartInstances[chart.id];
  if (!instance) {
    container.innerHTML = '';
    instance = echarts.init(container);
    chartInstances[chart.id] = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(container);
  }

  const funnelData = data.map(function(r, i) {
    var opacity = data.length <= 1 ? 1 : 1 - (i / (data.length - 1)) * 0.7;
    return {
      name: String(r[chart.x]),
      value: Number(r[chart.y]),
      itemStyle: { color: 'rgba(37, 99, 235, ' + opacity + ')' },
    };
  });

  instance.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c}' },
    series: [{
      type: 'funnel',
      left: '10%',
      width: '80%',
      top: 16,
      bottom: 16,
      data: funnelData,
      label: { fontSize: 11, color: '#737373' },
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
    }],
  }, true);

  instance.hideLoading();
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
