import { describe, it, expect } from "bun:test";
import { renderDashboardHtml } from "../src/viewer";
import type { DashboardSpec } from "../src/schema";

const baseSpec: DashboardSpec = {
  name: "chart-test",
  title: "Chart Test",
  source: "./test.csv",
  refresh: "manual",
  filters: [],
  layout: { columns: 3, rows: "auto" },
  charts: [],
};

function specWith(charts: DashboardSpec["charts"]): DashboardSpec {
  return { ...baseSpec, charts };
}

describe("pie chart rendering", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "pie1", type: "pie", query: "SELECT 1", label: "Revenue Split", x: "region", y: "revenue", position: [0, 0, 1, 1] },
    ])
  );

  it("includes renderPieChart function", () => {
    expect(html).toContain("function renderPieChart(");
  });

  it("renders pie series with donut radius", () => {
    expect(html).toContain("radius: ['40%', '70%']");
  });

  it("uses accent color for pie slices", () => {
    expect(html).toContain("rgba(37, 99, 235,");
  });

  it("renders card with correct label", () => {
    expect(html).toContain("Revenue Split");
  });

  it("dispatches pie type to renderPieChart", () => {
    expect(html).toContain("chart.type === 'pie'");
  });
});

describe("scatter chart rendering", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "scatter1", type: "scatter", query: "SELECT 1", label: "Deals vs Revenue", x: "deals", y: "revenue", position: [0, 0, 2, 1] },
    ])
  );

  it("includes renderScatterChart function", () => {
    expect(html).toContain("function renderScatterChart(");
  });

  it("renders scatter series type", () => {
    expect(html).toContain("type: 'scatter'");
  });

  it("uses accent color for scatter points", () => {
    expect(html).toContain("itemStyle: { color: '#2563eb' }");
  });

  it("uses value axes (not category)", () => {
    expect(html).toContain("xAxis: {");
    expect(html).toContain("type: 'value'");
  });

  it("dispatches scatter type to renderScatterChart", () => {
    expect(html).toContain("chart.type === 'scatter'");
  });
});

describe("gauge chart rendering", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "gauge1", type: "gauge", query: "SELECT 1", label: "Win Rate", format: "percent", min: 0, max: 100, position: [0, 0, 1, 1] },
    ])
  );

  it("includes renderGaugeChart function", () => {
    expect(html).toContain("function renderGaugeChart(");
  });

  it("renders gauge series type", () => {
    expect(html).toContain("type: 'gauge'");
  });

  it("uses accent color for gauge axis line", () => {
    expect(html).toContain("color: [[1, '#2563eb']]");
  });

  it("dispatches gauge type to renderGaugeChart", () => {
    expect(html).toContain("chart.type === 'gauge'");
  });

  it("references min and max from chart spec", () => {
    expect(html).toContain("chart.min");
    expect(html).toContain("chart.max");
  });
});

describe("all chart types in single dashboard", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "kpi1", type: "kpi", query: "SELECT 1", label: "KPI", format: "number", position: [0, 0, 1, 1] },
      { id: "bar1", type: "bar", query: "SELECT 1", label: "Bar", x: "x", y: "y", position: [1, 0, 1, 1] },
      { id: "line1", type: "line", query: "SELECT 1", label: "Line", x: "x", y: "y", position: [2, 0, 1, 1] },
      { id: "pie1", type: "pie", query: "SELECT 1", label: "Pie", x: "x", y: "y", position: [0, 1, 1, 1] },
      { id: "scatter1", type: "scatter", query: "SELECT 1", label: "Scatter", x: "x", y: "y", position: [1, 1, 1, 1] },
      { id: "gauge1", type: "gauge", query: "SELECT 1", label: "Gauge", format: "percent", position: [2, 1, 1, 1] },
      { id: "table1", type: "table", query: "SELECT 1", label: "Table", position: [0, 2, 3, 1] },
    ])
  );

  it("renders a card for every chart type", () => {
    expect(html).toContain('id="chart-kpi1"');
    expect(html).toContain('id="chart-bar1"');
    expect(html).toContain('id="chart-line1"');
    expect(html).toContain('id="chart-pie1"');
    expect(html).toContain('id="chart-scatter1"');
    expect(html).toContain('id="chart-gauge1"');
    expect(html).toContain('id="chart-table1"');
  });

  it("has no gradient styles (DESIGN.md compliance)", () => {
    expect(html).not.toContain("gradient");
  });
});
