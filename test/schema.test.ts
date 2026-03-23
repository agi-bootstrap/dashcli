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

  it("validates chart types are bar, line, kpi, or table", () => {
    const result = DashboardSpec.safeParse({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "pie", query: "SELECT 1", position: [0, 0, 1, 1] }],
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
});
