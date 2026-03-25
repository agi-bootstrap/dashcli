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
      charts: [{ id: "c1", type: "heatmap", query: "SELECT 1", position: [0, 0, 1, 1] }],
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

  it("parses the all-charts-dashboard.yaml with pie, scatter, gauge", () => {
    const raw = readFileSync(resolve(import.meta.dir, "../sample/all-charts-dashboard.yaml"), "utf-8");
    const parsed = parseYaml(raw);
    const spec = DashboardSpec.parse(parsed);

    expect(spec.name).toBe("all-charts-dashboard");
    expect(spec.charts).toHaveLength(8);

    const types = spec.charts.map((c) => c.type);
    expect(types).toContain("pie");
    expect(types).toContain("scatter");
    expect(types).toContain("gauge");
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

  it("rejects duplicate chart IDs", () => {
    const result = DashboardSpec.safeParse({
      name: "dup-ids",
      title: "Duplicate IDs",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [
        { id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] },
        { id: "c1", type: "kpi", query: "SELECT 2 as value", position: [1, 0, 1, 1] },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate filter IDs", () => {
    const result = DashboardSpec.safeParse({
      name: "dup-filters",
      title: "Duplicate Filters",
      source: "./data.csv",
      layout: { columns: 2 },
      charts: [
        { id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] },
      ],
      filters: [
        { id: "f1", type: "dropdown", column: "region", default: "all" },
        { id: "f1", type: "dropdown", column: "category", default: "all" },
      ],
    });
    expect(result.success).toBe(false);
  });
});
