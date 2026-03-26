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

  it("rejects legacy type 'bar' (no longer valid)", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [{ id: "c1", type: "bar", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
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

  it("accepts custom without x/y/group/value fields", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{
        id: "c1", type: "custom", query: "SELECT 1",
        position: [0, 0, 2, 1],
        option: { series: [{ type: "bar", data: [1, 2, 3] }] },
      }],
    });
    expect(result.success).toBe(true);
  });
});

describe("filter types", () => {
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

describe("custom chart type", () => {
  it("accepts custom chart with option field", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{
        id: "c1", type: "custom", query: "SELECT region, SUM(revenue) as total FROM sales GROUP BY region",
        position: [0, 0, 2, 1],
        option: {
          dataset: { source: "$rows" },
          xAxis: { type: "category" },
          yAxis: {},
          series: [{ type: "bar", encode: { x: "region", y: "total" } }],
        },
      }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects custom chart without option field", () => {
    const result = DashboardSpec.safeParse({
      name: "test", title: "Test", source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "custom", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("parses the all-charts-dashboard.yaml", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../sample/all-charts-dashboard.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    const spec = DashboardSpec.parse(parsed);

    expect(spec.name).toBe("all-charts-dashboard");
    const types = new Set(spec.charts.map((c) => c.type));
    expect(types).toContain("custom");
    expect(types).toContain("kpi");
    expect(types).toContain("table");
  });

  it("parses the custom-charts-dashboard.yaml", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../sample/custom-charts-dashboard.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    const spec = DashboardSpec.parse(parsed);

    expect(spec.name).toBe("custom-charts-dashboard");
    const types = new Set(spec.charts.map((c) => c.type));
    expect(types).toContain("custom");
    expect(types).toContain("kpi");
    expect(types).toContain("table");
  });
});
