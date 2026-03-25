import { describe, it, expect } from "bun:test";
import { DashboardSpec } from "../src/schema";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";

describe("DashboardSpec schema", () => {
  it("parses the sample sales-dashboard.yaml", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../sample/sales-dashboard.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    const spec = DashboardSpec.parse(parsed);

    expect(spec.name).toBe("sales-dashboard");
    expect(spec.title).toBe("Revenue by Region");
    expect(spec.charts).toHaveLength(6);
    expect(spec.filters).toHaveLength(2);
    expect(spec.layout.columns).toBe(3);
  });

  it("rejects unknown chart types", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "waterfall", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts pie chart type", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "pie", query: "SELECT 1", position: [0, 0, 1, 1], x: "name", y: "value" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts scatter chart type", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "scatter", query: "SELECT 1", position: [0, 0, 1, 1], x: "deals", y: "revenue" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts gauge chart type with min/max", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "gauge", query: "SELECT 1", position: [0, 0, 1, 1], min: 0, max: 100, format: "percent" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.charts[0].min).toBe(0);
      expect(result.data.charts[0].max).toBe(100);
    }
  });

  it("parses the all-charts-dashboard.yaml with all chart types", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../sample/all-charts-dashboard.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    const spec = DashboardSpec.parse(parsed);

    expect(spec.name).toBe("all-charts-dashboard");
    expect(spec.charts).toHaveLength(12);

    const types = spec.charts.map((c) => c.type);
    expect(types).toContain("pie");
    expect(types).toContain("scatter");
    expect(types).toContain("gauge");
    expect(types).toContain("area");
    expect(types).toContain("stacked_bar");
    expect(types).toContain("heatmap");
    expect(types).toContain("funnel");
    expect(types).toContain("bar");
    expect(types).toContain("line");
    expect(types).toContain("kpi");
    expect(types).toContain("table");

    const gauge = spec.charts.find((c) => c.type === "gauge");
    expect(gauge?.min).toBe(0);
    expect(gauge?.max).toBe(50000);
  });

  it("rejects missing required fields", () => {
    const result = DashboardSpec.safeParse({ name: "test" });
    expect(result.success).toBe(false);
  });

  it("validates position as 4-element tuple", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "kpi", query: "SELECT 1", position: [0, 0] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects pie chart without x and y fields", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "pie", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects scatter chart without x and y fields", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "scatter", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects bar chart without x and y fields", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "bar", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid minimal spec", () => {
    const result = DashboardSpec.safeParse({
      name: "minimal",
      title: "Minimal Dashboard",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });
});

describe("new chart and filter types", () => {
  it("accepts area chart type with x and y", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "a1", type: "area", query: "SELECT 1", x: "month", y: "revenue", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts stacked_bar chart type with x, y, and group", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "s1", type: "stacked_bar", query: "SELECT 1", x: "region", y: "revenue", group: "category", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects stacked_bar without group", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "s1", type: "stacked_bar", query: "SELECT 1", x: "region", y: "revenue", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts heatmap chart type with x, y, and value", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "h1", type: "heatmap", query: "SELECT 1", x: "region", y: "category", value: "total", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects heatmap without value", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "h1", type: "heatmap", query: "SELECT 1", x: "region", y: "category", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts funnel chart type with x and y", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "f1", type: "funnel", query: "SELECT 1", x: "stage", y: "count", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multi_select filter type", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      filters: [{ id: "region", type: "multi_select", column: "region", default: [] }],
      charts: [{ id: "k1", type: "kpi", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts range filter type", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      filters: [{ id: "amount", type: "range", column: "amount", default: [0, 1000] }],
      charts: [{ id: "k1", type: "kpi", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts text filter type", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      filters: [{ id: "search", type: "text", column: "name", default: "" }],
      charts: [{ id: "k1", type: "kpi", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });
});
