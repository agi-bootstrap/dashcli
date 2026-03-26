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

describe("table numeric column alignment", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "table1", type: "table", query: "SELECT 1", label: "Data", position: [0, 0, 3, 1] },
    ])
  );

  it("includes numeric column detection logic", () => {
    expect(html).toContain("numCols");
    expect(html).toContain("typeof v === 'number'");
    expect(html).toContain("isNaN(Number(v))");
  });

  it("applies .num class to numeric headers and cells", () => {
    expect(html).toContain('class="num"');
    expect(html).toContain("numCols.has(col)");
  });

  it("includes right-alignment CSS rule for .num class", () => {
    expect(html).toContain("th.num");
    expect(html).toContain("td.num");
    expect(html).toContain("text-align: right");
  });

  it("uses 0.5px letter-spacing on table headers (DESIGN.md)", () => {
    expect(html).toContain("letter-spacing: 0.5px");
  });

  it("guards null values in numeric columns (renders empty, not '0')", () => {
    expect(html).toContain("v == null ? '' : Number(v)");
  });
});

describe("KPI mobile responsiveness", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "kpi1", type: "kpi", query: "SELECT 1", label: "Revenue", format: "currency", position: [0, 0, 1, 1] },
    ])
  );

  it("overrides min-height for KPI containers on mobile", () => {
    expect(html).toContain(".card:has(.kpi-value)");
    expect(html).toContain("min-height: auto");
  });
});

describe("new filter types", () => {
  const specWithFilters = (filters: DashboardSpec["filters"]): DashboardSpec => ({
    name: "test",
    title: "Test",
    source: "./data.csv",
    refresh: "manual",
    layout: { columns: 3, rows: "auto" },
    filters,
    charts: [{ id: "k1", type: "kpi", query: "SELECT 1", position: [0, 0, 1, 1] }],
  });

  it("renders multi_select as select with multiple attribute", () => {
    const html = renderDashboardHtml(specWithFilters([
      { id: "region", type: "multi_select", column: "region", default: [] }
    ]));
    expect(html).toContain('multiple');
    expect(html).toContain('id="filter-region"');
  });

  it("renders range filter with two number inputs", () => {
    const html = renderDashboardHtml(specWithFilters([
      { id: "amount", type: "range", column: "amount", default: [0, 1000] }
    ]));
    expect(html).toContain('type="number"');
    expect(html).toContain('id="filter-amount-min"');
    expect(html).toContain('id="filter-amount-max"');
  });

  it("renders text filter with text input", () => {
    const html = renderDashboardHtml(specWithFilters([
      { id: "search", type: "text", column: "name", default: "" }
    ]));
    expect(html).toContain('type="text"');
    expect(html).toContain('placeholder="Search..."');
    expect(html).toContain('id="filter-search"');
  });

  it("multi_select has aria-label", () => {
    const html = renderDashboardHtml(specWithFilters([
      { id: "region", type: "multi_select", column: "region", default: [] }
    ]));
    expect(html).toContain('aria-label="region"');
  });
});

describe("ECharts dashcli theme", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Chart", position: [0, 0, 1, 1],
        option: { xAxis: { type: "category" }, yAxis: {}, series: [{ type: "bar", data: [1] }] },
      },
    ])
  );

  it("registers the dashcli theme", () => {
    expect(html).toContain("echarts.registerTheme('dashcli'");
  });

  it("uses themed init for all chart instances", () => {
    expect(html).toContain("echarts.init(container, 'dashcli')");
    expect(html).not.toContain("echarts.init(container)");
  });

  it("theme includes design system colors", () => {
    expect(html).toContain("color: ['#2563eb'");
  });

  it("theme includes grid defaults", () => {
    expect(html).toContain("grid: { left: 16, right: 16, top: 16, bottom: 32");
  });
});

describe("custom chart rendering", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT region, total FROM sales",
        label: "Custom Bar", position: [0, 0, 2, 1],
        option: {
          dataset: { source: "$rows" },
          xAxis: { type: "category" },
          yAxis: {},
          series: [{ type: "bar", encode: { x: "region", y: "total" } }],
        },
      },
    ])
  );

  it("includes resolveDataBindings function", () => {
    expect(html).toContain("function resolveDataBindings(");
  });

  it("includes renderEChartsOption function", () => {
    expect(html).toContain("function renderEChartsOption(");
  });

  it("dispatches custom type in renderChart", () => {
    expect(html).toContain("chart.type === 'custom'");
  });

  it("resolveDataBindings handles $rows token", () => {
    expect(html).toContain("=== '$rows'");
  });

  it("resolveDataBindings handles $rows.column token", () => {
    expect(html).toContain("'$rows.'");
  });

  it("resolveDataBindings handles $row0.column token", () => {
    expect(html).toContain("'$row0.'");
  });

  it("resolveDataBindings handles $distinct.column token", () => {
    expect(html).toContain("'$distinct.'");
  });

  it("renders card with correct label", () => {
    expect(html).toContain("Custom Bar");
    expect(html).toContain('id="chart-custom1"');
  });

  it("serializes option into SPEC JSON", () => {
    expect(html).toContain('"dataset"');
    expect(html).toContain('"$rows"');
  });
});

describe("resolveDataBindings column-not-found", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Chart", position: [0, 0, 1, 1],
        option: { series: [{ type: "bar", data: "$rows.nonexistent" }] },
      },
    ])
  );

  it("contains column-not-found warning logic", () => {
    expect(html).toContain("not found in data");
  });

  it("passes warnings array to resolveDataBindings", () => {
    expect(html).toContain("var warnings = []");
    expect(html).toContain("resolveDataBindings(chart.option, data, warnings)");
  });

  it("logs warnings to console", () => {
    expect(html).toContain("console.warn");
    expect(html).toContain("column warnings");
  });
});

describe("empty data guard for custom", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Chart", position: [0, 0, 1, 1],
        option: { series: [{ type: "bar", data: [1] }] },
      },
    ])
  );

  it("checks data.length before renderEChartsOption", () => {
    expect(html).toContain("!data.length");
  });

  it("shows 'No data' message for empty results", () => {
    expect(html).toContain("No data");
  });
});

describe("renderEChartsOption function", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Chart", position: [0, 0, 1, 1],
        option: { series: [{ type: "bar", data: [1] }] },
      },
    ])
  );

  it("defines renderEChartsOption as the single ECharts init path", () => {
    expect(html).toContain("function renderEChartsOption(");
  });

  it("does not contain legacy per-type render functions", () => {
    expect(html).not.toContain("function renderPieChart(");
    expect(html).not.toContain("function renderScatterChart(");
    expect(html).not.toContain("function renderGaugeChart(");
    expect(html).not.toContain("function renderStackedBarChart(");
    expect(html).not.toContain("function renderHeatmapChart(");
    expect(html).not.toContain("function renderFunnelChart(");
    expect(html).not.toContain("function renderEChart(");
    expect(html).not.toContain("function renderCustomChart(");
  });

  it("no bare echarts.init(container) calls — only themed init", () => {
    expect(html).not.toContain("echarts.init(container)");
    expect(html).toContain("echarts.init(container, 'dashcli')");
  });
});

describe("chartObservers map for ResizeObserver cleanup", () => {
  const html = renderDashboardHtml(
    specWith([
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Chart", position: [0, 0, 1, 1],
        option: { series: [{ type: "bar", data: [1] }] },
      },
    ])
  );

  it("defines chartObservers map", () => {
    expect(html).toContain("chartObservers");
  });

  it("stores observer in chartObservers on init", () => {
    expect(html).toContain("chartObservers[chartId] = ro");
  });

  it("disconnects observer on dispose", () => {
    expect(html).toContain("chartObservers[chart.id].disconnect()");
  });
});

describe("custom and shortcut types coexist", () => {
  const html = renderDashboardHtml(
    specWith([
      { id: "kpi1", type: "kpi", query: "SELECT 1", label: "KPI", format: "number", position: [0, 0, 1, 1] },
      {
        id: "custom1", type: "custom", query: "SELECT 1", label: "Custom", position: [1, 0, 2, 1],
        option: { series: [{ type: "line", data: "$rows.value" }] },
      },
      { id: "table1", type: "table", query: "SELECT 1", label: "Table", position: [0, 1, 3, 1] },
    ])
  );

  it("renders cards for all types", () => {
    expect(html).toContain('id="chart-kpi1"');
    expect(html).toContain('id="chart-custom1"');
    expect(html).toContain('id="chart-table1"');
  });

  it("has no gradient styles (DESIGN.md compliance)", () => {
    expect(html).not.toContain("gradient");
  });
});
