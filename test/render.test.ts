import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolve, dirname } from "path";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { parseRenderSpec, renderChart } from "../src/render";
import { StandaloneChartSpec, DashboardSpec } from "../src/schema";

const TMP = resolve(import.meta.dir, ".tmp-render-test");
const SAMPLE_CSV = resolve(import.meta.dir, "../sample/sales.csv");

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function writeYaml(name: string, content: string): string {
  const p = resolve(TMP, name);
  writeFileSync(p, content, "utf-8");
  return p;
}

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe("StandaloneChartSpec", () => {
  test("validates with source + chart (no position)", () => {
    const result = StandaloneChartSpec.safeParse({
      source: "./sales.csv",
      chart: {
        id: "test",
        type: "kpi",
        query: "SELECT SUM(revenue) as value FROM sales",
      },
    });
    expect(result.success).toBe(true);
  });

  test("rejects missing source", () => {
    const result = StandaloneChartSpec.safeParse({
      chart: { id: "test", type: "kpi", query: "SELECT 1" },
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing chart", () => {
    const result = StandaloneChartSpec.safeParse({
      source: "./sales.csv",
    });
    expect(result.success).toBe(false);
  });

  test("rejects custom chart without option", () => {
    const result = StandaloneChartSpec.safeParse({
      source: "./sales.csv",
      chart: { id: "test", type: "custom", query: "SELECT 1" },
    });
    expect(result.success).toBe(false);
  });

  test("accepts custom chart with option", () => {
    const result = StandaloneChartSpec.safeParse({
      source: "./sales.csv",
      chart: {
        id: "test",
        type: "custom",
        query: "SELECT 1",
        option: { dataset: { source: "$rows" } },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("DashboardSpec still requires position", () => {
  test("rejects chart without position", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./sales.csv",
      layout: { columns: 3, rows: "auto" },
      charts: [{ id: "test", type: "kpi", query: "SELECT 1" }],
    });
    expect(result.success).toBe(false);
  });

  test("accepts chart with position", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./sales.csv",
      layout: { columns: 3, rows: "auto" },
      charts: [{ id: "test", type: "kpi", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });
});

// ─── Spec Detection Tests ────────────────────────────────────────────────────

describe("parseRenderSpec", () => {
  test("detects standalone chart spec", () => {
    const p = writeYaml("standalone.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: test-kpi
  type: kpi
  query: "SELECT SUM(revenue) as value FROM sales"
`);
    const target = parseRenderSpec(p);
    expect(target.chart.id).toBe("test-kpi");
    expect(target.filters).toHaveLength(0);
  });

  test("detects dashboard spec with --chart", () => {
    const p = writeYaml("dashboard.yaml", `
name: test
title: Test
source: ${SAMPLE_CSV}
layout:
  columns: 3
  rows: auto
charts:
  - id: rev-kpi
    type: kpi
    query: "SELECT SUM(revenue) as value FROM sales"
    position: [0, 0, 1, 1]
  - id: region-bar
    type: kpi
    query: "SELECT COUNT(*) as value FROM sales"
    position: [1, 0, 1, 1]
`);
    const target = parseRenderSpec(p, "rev-kpi");
    expect(target.chart.id).toBe("rev-kpi");
  });

  test("errors on dashboard spec without --chart", () => {
    const p = writeYaml("dashboard-no-chart.yaml", `
name: test
title: Test
source: ${SAMPLE_CSV}
layout:
  columns: 3
  rows: auto
charts:
  - id: rev-kpi
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
`);
    expect(() => parseRenderSpec(p)).toThrow("Dashboard spec requires --chart");
  });

  test("errors on unknown chart ID", () => {
    const p = writeYaml("dashboard-bad-id.yaml", `
name: test
title: Test
source: ${SAMPLE_CSV}
layout:
  columns: 3
  rows: auto
charts:
  - id: rev-kpi
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
`);
    expect(() => parseRenderSpec(p, "nonexistent")).toThrow("Chart not found: nonexistent");
  });

  test("errors when both chart and charts present", () => {
    const p = writeYaml("ambiguous.yaml", `
source: ./sales.csv
chart:
  id: standalone
  type: kpi
  query: "SELECT 1 as value"
charts:
  - id: dashboard
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
`);
    expect(() => parseRenderSpec(p)).toThrow("Ambiguous spec");
  });

  test("errors on spec with neither chart nor charts", () => {
    const p = writeYaml("neither.yaml", "name: test\ntitle: Test\n");
    expect(() => parseRenderSpec(p)).toThrow("Invalid spec: expected 'chart' or 'charts'");
  });
});

// ─── Render HTML Tests ───────────────────────────────────────────────────────

describe("renderChart HTML", () => {
  test("renders standalone KPI chart to HTML", async () => {
    const p = writeYaml("kpi.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: total-revenue
  type: kpi
  query: "SELECT SUM(revenue) as value FROM sales"
  label: Total Revenue
  format: currency
`);
    const result = await renderChart(p, { format: "html" });
    expect(result.chartId).toBe("total-revenue");
    expect(result.html).toContain("Total Revenue");
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("$");
  });

  test("renders standalone custom chart to HTML", async () => {
    const p = writeYaml("bar.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: by-region
  type: custom
  query: "SELECT region, SUM(revenue) as total FROM sales GROUP BY region"
  label: Revenue by Region
  option:
    dataset: { source: "$rows" }
    xAxis: { type: category }
    yAxis: {}
    series:
      - type: bar
        encode: { x: region, y: total }
`);
    const result = await renderChart(p, { format: "html" });
    expect(result.chartId).toBe("by-region");
    expect(result.html).toContain("echarts.init");
    expect(result.html).toContain("dashcli");
  });

  test("renders standalone table chart to HTML", async () => {
    const p = writeYaml("table.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: detail
  type: table
  query: "SELECT region, product_category, revenue FROM sales LIMIT 10"
  label: Sales Detail
`);
    const result = await renderChart(p, { format: "html" });
    expect(result.chartId).toBe("detail");
    expect(result.html).toContain("<table");
    expect(result.html).toContain("Sales Detail");
  });

  test("renders HTML to file with --out", async () => {
    const p = writeYaml("out-test.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: out-kpi
  type: kpi
  query: "SELECT COUNT(*) as value FROM sales"
`);
    const outPath = resolve(TMP, "output/chart.html");
    const result = await renderChart(p, { format: "html", outPath });
    expect(result.path).toBe(outPath);
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, "utf-8");
    expect(content).toContain("<!DOCTYPE html>");
  });

  test("renders chart from dashboard spec with filter defaults", async () => {
    const p = writeYaml("filtered-dash.yaml", `
name: filtered
title: Filtered
source: ${SAMPLE_CSV}
layout:
  columns: 3
  rows: auto
filters:
  - id: region
    type: dropdown
    column: region
    default: all
charts:
  - id: total-rev
    type: kpi
    query: "SELECT SUM(revenue) as value FROM sales WHERE {{region}}"
    position: [0, 0, 1, 1]
`);
    const result = await renderChart(p, { chartId: "total-rev", format: "html" });
    expect(result.chartId).toBe("total-rev");
    expect(result.html).toContain("<!DOCTYPE html>");
  });

  test("handles empty query result for KPI", async () => {
    const p = writeYaml("empty-kpi.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: empty
  type: kpi
  query: "SELECT SUM(revenue) as value FROM sales WHERE 1=0"
`);
    const result = await renderChart(p, { format: "html" });
    expect(result.html).toContain("—");
  });

  test("handles empty query result for custom chart", async () => {
    const p = writeYaml("empty-custom.chart.yaml", `
source: ${SAMPLE_CSV}
chart:
  id: empty-bar
  type: custom
  query: "SELECT region, SUM(revenue) as total FROM sales WHERE 1=0 GROUP BY region"
  option:
    dataset: { source: "$rows" }
    xAxis: { type: category }
    yAxis: {}
    series:
      - type: bar
        encode: { x: region, y: total }
`);
    const result = await renderChart(p, { format: "html" });
    expect(result.chartId).toBe("empty-bar");
    // Empty data still generates valid HTML with ECharts
    expect(result.html).toContain("echarts.init");
  });
});

// ─── Suggest --charts-dir Tests ──────────────────────────────────────────────

describe("writeChartFiles", () => {
  const { writeChartFiles } = require("../src/suggest");

  test("writes individual chart files", () => {
    const chartsDir = resolve(TMP, "charts-out");
    const { files, spec } = writeChartFiles(SAMPLE_CSV, chartsDir);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(existsSync(f)).toBe(true);
      expect(f).toEndWith(".chart.yaml");
    }
  });

  test("chart files validate as StandaloneChartSpec", () => {
    const chartsDir = resolve(TMP, "charts-validate");
    const { files } = writeChartFiles(SAMPLE_CSV, chartsDir);
    const yaml = require("yaml");
    for (const f of files) {
      const content = readFileSync(f, "utf-8");
      const parsed = yaml.parse(content);
      const result = StandaloneChartSpec.safeParse(parsed);
      expect(result.success).toBe(true);
    }
  });

  test("chart files do not contain position", () => {
    const chartsDir = resolve(TMP, "charts-no-pos");
    const { files } = writeChartFiles(SAMPLE_CSV, chartsDir);
    for (const f of files) {
      const content = readFileSync(f, "utf-8");
      expect(content).not.toContain("position:");
    }
  });

  test("chart files have correct source field", () => {
    const chartsDir = resolve(TMP, "charts-source");
    const { files } = writeChartFiles(SAMPLE_CSV, chartsDir);
    const yaml = require("yaml");
    for (const f of files) {
      const parsed = yaml.parse(readFileSync(f, "utf-8"));
      // Source should be a relative path that resolves to the CSV
      expect(parsed.source).toBeDefined();
      expect(typeof parsed.source).toBe("string");
    }
  });

  test("creates directory if not exists", () => {
    const chartsDir = resolve(TMP, "new-dir/nested");
    const { files } = writeChartFiles(SAMPLE_CSV, chartsDir);
    expect(existsSync(chartsDir)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  test("overwrites existing files", () => {
    const chartsDir = resolve(TMP, "charts-overwrite");
    writeChartFiles(SAMPLE_CSV, chartsDir);
    // Run again — should not throw
    const { files } = writeChartFiles(SAMPLE_CSV, chartsDir);
    expect(files.length).toBeGreaterThan(0);
  });
});
