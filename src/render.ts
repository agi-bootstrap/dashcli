import { resolve, dirname, relative } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { parse as parseYaml } from "yaml";
import { tmpdir } from "os";
import { DashboardSpec, StandaloneChartSpec } from "./schema";
import type { FilterSpec, StandaloneChartFields } from "./schema";
import { loadDataSource } from "./datasource";
import { executeChartQuery } from "./query";

const ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js";

// ─── Spec Detection ──────────────────────────────────────────────────────────

interface RenderTarget {
  chart: StandaloneChartFields;
  source: string;
  filters: FilterSpec[];
}

export function parseRenderSpec(
  specPath: string,
  chartId?: string,
): RenderTarget {
  const raw = readFileSync(specPath, "utf-8");
  const parsed = parseYaml(raw);

  if (parsed && typeof parsed === "object") {
    const hasChart = "chart" in parsed;
    const hasCharts = "charts" in parsed;

    if (hasChart && hasCharts) {
      throw new Error("Ambiguous spec: found both 'chart' and 'charts' keys");
    }

    // Standalone chart spec
    if (hasChart) {
      const result = StandaloneChartSpec.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid standalone chart spec: ${result.error.message}`);
      }
      const sourcePath = result.data.source.startsWith("/")
        ? result.data.source
        : resolve(dirname(specPath), result.data.source);
      return { chart: result.data.chart, source: sourcePath, filters: [] };
    }

    // Dashboard spec
    if (hasCharts) {
      const result = DashboardSpec.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Invalid dashboard spec: ${result.error.message}`);
      }
      if (!chartId) {
        throw new Error("Dashboard spec requires --chart <id> to select a chart");
      }
      const chart = result.data.charts.find((c) => c.id === chartId);
      if (!chart) {
        const ids = result.data.charts.map((c) => c.id).join(", ");
        throw new Error(`Chart not found: ${chartId}. Available: ${ids}`);
      }
      const sourcePath = result.data.source.startsWith("/")
        ? result.data.source
        : resolve(dirname(specPath), result.data.source);
      // Strip position for rendering (not needed for standalone output)
      const { position: _, ...chartFields } = chart;
      return { chart: chartFields, source: sourcePath, filters: result.data.filters };
    }
  }

  throw new Error("Invalid spec: expected 'chart' or 'charts' key at top level");
}

// ─── HTML Generation ─────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function generateChartHtml(
  chart: StandaloneChartFields,
  data: Record<string, unknown>[],
  echartsSource: string,
): string {
  const label = chart.label || chart.id.replace(/_/g, " ");
  const safeData = JSON.stringify(data).replace(/</g, "\\u003c");

  if (chart.type === "kpi") {
    const row = data[0] || {};
    const val = row.value ?? row[Object.keys(row)[0] ?? ""] ?? null;
    return renderKpiHtml(label, val, chart.format);
  }

  if (chart.type === "table") {
    return renderTableHtml(label, data);
  }

  // type: custom
  if (!chart.option) {
    throw new Error("option is required for custom charts");
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(label)} — dashcli</title>
<script>${echartsSource}</script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #ffffff; }
#chart { width: 100%; height: 100vh; }
</style>
</head>
<body>
<div id="chart"></div>
<script>
echarts.registerTheme('dashcli', {
  color: ['#2563eb', 'rgba(37,99,235,0.7)', 'rgba(37,99,235,0.5)', 'rgba(37,99,235,0.35)', 'rgba(37,99,235,0.2)', '#60a5fa', '#93c5fd'],
  grid: { left: 16, right: 16, top: 16, bottom: 32, containLabel: true },
  categoryAxis: { axisLabel: { fontSize: 11, color: '#737373' }, axisLine: { lineStyle: { color: '#e2e2e2' } }, axisTick: { show: false } },
  valueAxis: { axisLabel: { fontSize: 11, color: '#737373' }, axisLine: { show: false }, splitLine: { lineStyle: { color: '#f0f0f0' } } },
  bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } },
  line: { lineStyle: { width: 2.5 }, smooth: true, symbol: 'circle', symbolSize: 6 },
  pie: { itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, label: { fontSize: 11, color: '#737373' } },
  scatter: { symbolSize: 8 },
  gauge: { axisLine: { lineStyle: { width: 12, color: [[1, '#2563eb']] } }, axisTick: { show: false }, splitLine: { length: 8, lineStyle: { color: '#e2e2e2' } }, axisLabel: { fontSize: 11, color: '#737373' } },
  heatmap: { itemStyle: { borderColor: '#ffffff', borderWidth: 2, borderRadius: 2 } },
  funnel: { itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, label: { fontSize: 11, color: '#737373' } },
  legend: { textStyle: { fontSize: 11, color: '#737373' } }
});

var data = ${safeData};
var chartOption = ${JSON.stringify(chart.option).replace(/</g, "\\u003c")};

function resolveDataBindings(obj, data) {
  if (typeof obj === 'string') {
    if (obj === '$rows') return data;
    if (obj.startsWith('$rows.')) return data.map(function(r) { return r[obj.slice(6)]; });
    if (obj.startsWith('$row0.')) return data[0] ? data[0][obj.slice(6)] : null;
    if (obj.startsWith('$distinct.')) {
      var col = obj.slice(10), seen = {}, result = [];
      for (var i = 0; i < data.length; i++) { var v = data[i][col]; if (!seen[v]) { seen[v] = true; result.push(v); } }
      return result;
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(function(item) { return resolveDataBindings(item, data); });
  if (obj !== null && typeof obj === 'object') {
    var out = {};
    for (var key in obj) { if (obj.hasOwnProperty(key)) out[key] = resolveDataBindings(obj[key], data); }
    return out;
  }
  return obj;
}

var resolved = resolveDataBindings(chartOption, data);
var instance = echarts.init(document.getElementById('chart'), 'dashcli');
instance.setOption(resolved, true);
</script>
</body>
</html>`;
}

function renderKpiHtml(label: string, val: unknown, format?: string): string {
  let formatted: string;
  if (val == null) {
    formatted = "—";
  } else if (format === "currency") {
    const n = Number(val);
    if (n >= 1_000_000) formatted = "$" + (n / 1_000_000).toFixed(1) + "M";
    else if (n >= 1_000) formatted = "$" + (n / 1_000).toFixed(0) + "K";
    else formatted = "$" + n.toFixed(0);
  } else if (format === "percent") {
    formatted = Number(val).toFixed(1) + "%";
  } else if (typeof val === "number") {
    formatted = val.toLocaleString();
  } else {
    formatted = String(val);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
.label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #737373; margin-bottom: 12px; }
.value { font-size: 36px; font-weight: 700; color: #1a1a1a; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="label">${escHtml(label)}</div>
<div class="value">${escHtml(formatted)}</div>
</body>
</html>`;
}

function renderTableHtml(label: string, data: Record<string, unknown>[]): string {
  if (!data.length) {
    return `<!DOCTYPE html><html><head><style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;color:#737373;}</style></head><body>No data</body></html>`;
  }
  const cols = Object.keys(data[0]);
  const numCols = new Set<string>();
  for (const col of cols) {
    const v = data[0][col];
    if (typeof v === "number") numCols.add(col);
  }

  let rows = "";
  for (const row of data.slice(0, 100)) {
    rows += "<tr>";
    for (const col of cols) {
      const v = row[col];
      const isNum = numCols.has(col);
      rows += `<td${isNum ? ' class="num"' : ""}>${isNum ? (v == null ? "" : Number(v).toLocaleString()) : escHtml(String(v ?? ""))}</td>`;
    }
    rows += "</tr>";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #ffffff; padding: 16px; }
.label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #737373; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
th { text-align: left; padding: 8px; border-bottom: 2px solid #e2e2e2; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #737373; }
td { padding: 8px; border-bottom: 1px solid #f0f0f0; color: #6b6b6b; }
.num { text-align: right; }
</style>
</head>
<body>
<div class="label">${escHtml(label)}</div>
<table><thead><tr>${cols.map((c) => `<th${numCols.has(c) ? ' class="num"' : ""}>${escHtml(c.replace(/_/g, " "))}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>
${data.length > 100 ? `<div style="text-align:center;padding:8px;color:#737373;font-size:12px;">Showing 100 of ${data.length} rows</div>` : ""}
</body>
</html>`;
}

// ─── Chrome Screenshot ───────────────────────────────────────────────────────

function findChrome(): string | null {
  if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (process.platform === "linux") {
    for (const cmd of ["google-chrome", "chromium-browser", "chromium"]) {
      const r = Bun.spawnSync(["which", cmd]);
      if (r.exitCode === 0) return r.stdout.toString().trim();
    }
  } else if (process.platform === "win32") {
    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function screenshotHtml(
  htmlContent: string,
  outPath: string,
  width: number,
  height: number,
): Promise<void> {
  const chrome = findChrome();
  if (!chrome) {
    throw new Error(
      "Chrome/Chromium not found. PNG output requires Chrome.\n" +
      "  macOS: Install Google Chrome\n" +
      "  Linux: apt install chromium-browser\n" +
      "  Or use --format html for HTML output without Chrome.",
    );
  }

  const tmpHtml = resolve(tmpdir(), `dashcli-render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  writeFileSync(tmpHtml, htmlContent, "utf-8");

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  try {
    const args = [
      chrome,
      "--headless=new",
      "--disable-gpu",
      `--screenshot=${resolve(outPath)}`,
      `--window-size=${width},${height}`,
      "--virtual-time-budget=5000",
      `file://${tmpHtml}`,
    ];
    // --no-sandbox only needed in containers/CI, not on developer machines
    if (process.platform === "linux" && process.getuid?.() === 0) {
      args.splice(2, 0, "--no-sandbox");
    }
    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Chrome screenshot failed (exit ${exitCode}): ${stderr.slice(0, 200)}`);
    }

    if (!existsSync(outPath)) {
      throw new Error("Chrome completed but screenshot file was not created");
    }
  } finally {
    try { unlinkSync(tmpHtml); } catch {}
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface RenderOptions {
  chartId?: string;
  outPath?: string;
  format?: "png" | "html";
  width?: number;
  height?: number;
}

export async function renderChart(
  specPath: string,
  options: RenderOptions = {},
): Promise<{ chartId: string; html: string; path?: string }> {
  const resolvedSpec = resolve(specPath);
  const target = parseRenderSpec(resolvedSpec, options.chartId);

  // Load data and execute query
  const { db, tableName } = loadDataSource(target.source);
  let data: Record<string, unknown>[];
  try {
    const defaultFilters: Record<string, string | string[] | [string, string] | [number, number]> = {};
    for (const f of target.filters) {
      defaultFilters[f.id] = f.default;
    }
    data = executeChartQuery(db, target.chart.query, target.filters, defaultFilters);
  } finally {
    db.close();
  }

  // Only fetch ECharts for custom chart types (KPI and table don't need it)
  let echartsSource = "";
  if (target.chart.type === "custom") {
    const echartsRes = await fetch(ECHARTS_CDN);
    if (!echartsRes.ok) {
      throw new Error(`Failed to fetch ECharts: ${echartsRes.statusText}`);
    }
    echartsSource = await echartsRes.text();
  }

  const html = generateChartHtml(target.chart, data, echartsSource);
  const format = options.format ?? "png";
  const chartId = target.chart.id;

  if (format === "html") {
    if (options.outPath) {
      const outDir = dirname(resolve(options.outPath));
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(options.outPath), html, "utf-8");
      return { chartId, html, path: resolve(options.outPath) };
    }
    return { chartId, html };
  }

  // PNG format: screenshot the HTML
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const outPath = options.outPath ?? `${chartId}.png`;
  const resolvedOut = resolve(outPath);

  await screenshotHtml(html, resolvedOut, width, height);

  return { chartId, html, path: resolvedOut };
}
