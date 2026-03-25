import { resolve, dirname } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { loadDashboard } from "./server";
import { renderDashboardHtml } from "./viewer";
import { executeChartQuery } from "./query";

const ECHARTS_CDN = "https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js";

export async function exportDashboard(specPath: string, outDir?: string) {
  const ctx = loadDashboard(specPath);
  const { spec, db, dropdownValues } = ctx;

  // Pre-run all chart queries with default filter values
  const defaultFilters: Record<string, string | string[] | [string, string] | [number, number]> = {};
  for (const f of spec.filters) {
    defaultFilters[f.id] = f.default;
  }

  const chartData: Record<string, Record<string, unknown>[]> = {};
  for (const chart of spec.charts) {
    chartData[chart.id] = executeChartQuery(db, chart.query, spec.filters, defaultFilters);
  }

  // Serialize dropdown values
  const filterValues: Record<string, string[]> = {};
  for (const [id, vals] of dropdownValues) {
    filterValues[id] = vals;
  }

  // Fetch ECharts library for inlining
  console.log("  Fetching ECharts library...");
  const echartsRes = await fetch(ECHARTS_CDN);
  if (!echartsRes.ok) {
    throw new Error(`Failed to fetch ECharts: ${echartsRes.statusText}`);
  }
  const echartsSource = await echartsRes.text();

  // Get the base HTML from the existing renderer
  let html = renderDashboardHtml(spec);

  // Replace CDN script tag with inlined ECharts
  html = html.replace(
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[^"]+"><\/script>/,
    `<script>${echartsSource}</script>`
  );

  // Inject preloaded data and override fetch functions
  const preloadScript = `
const PRELOADED_DATA = ${JSON.stringify(chartData).replace(/</g, '\\u003c')};
const PRELOADED_FILTERS = ${JSON.stringify(filterValues).replace(/</g, '\\u003c')};
`;

  // Replace fetchChartData to use embedded data
  const offlineFetchChart = `
async function fetchChartData(chartId) {
  if (PRELOADED_DATA[chartId]) return PRELOADED_DATA[chartId];
  throw new Error('No data for chart: ' + chartId);
}
`;

  // Replace populateDropdowns to use embedded data
  const offlinePopulateDropdowns = `
async function populateDropdowns() {
  for (const [filterId, options] of Object.entries(PRELOADED_FILTERS)) {
    const select = document.getElementById('filter-' + filterId);
    if (!select || select.tagName !== 'SELECT') continue;
    for (const opt of options) {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = opt;
      select.appendChild(el);
    }
  }
}
`;

  // Inject preloaded data after SPEC declaration
  html = html.replace(
    /const SPEC = .*;/,
    (match) => `${match}\n${preloadScript}`
  );

  // Replace fetchChartData function
  html = html.replace(
    /async function fetchChartData\(chartId\) \{[\s\S]*?return res\.json\(\);\n\}/,
    offlineFetchChart.trim()
  );

  // Replace populateDropdowns function
  html = html.replace(
    /async function populateDropdowns\(\) \{[\s\S]*?} catch \{\}\n\}/,
    offlinePopulateDropdowns.trim()
  );

  // Hide filter bar in export — filters can't work without a server
  html = html.replace(
    '<div class="filter-bar">',
    '<div class="filter-bar" style="display:none">'
  );

  // Update subtitle to indicate this is an export with timestamp
  const exportDate = new Date().toISOString().slice(0, 10);
  html = html.replace(
    /dashcli &middot;/,
    `dashcli export &middot; ${exportDate} &middot;`
  );

  // Determine output path
  const dir = outDir || dirname(specPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const outFile = resolve(dir, `${spec.name}.html`);

  writeFileSync(outFile, html, "utf-8");

  const sizeKb = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(0);
  console.log(`\n  ✓ Exported: ${outFile}`);
  console.log(`    ${spec.charts.length} charts, ${Object.keys(filterValues).length} filters`);
  console.log(`    ${sizeKb} KB (self-contained, works offline)\n`);
}
