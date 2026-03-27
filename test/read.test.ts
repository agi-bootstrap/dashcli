import { describe, it, expect } from "bun:test";
import { readSpec, formatReadText } from "../src/read";
import { resolve } from "path";

const sampleSpec = resolve(import.meta.dir, "../sample/sales-dashboard.yaml");

describe("readSpec", () => {
  it("parses the sample spec and returns a structured summary", () => {
    const summary = readSpec(sampleSpec);
    expect(summary.name).toBe("sales-dashboard");
    expect(summary.title).toBe("Revenue by Region");
    expect(summary.source).toBe("./sales.csv");
    expect(summary.chartCount).toBe(6);
    expect(summary.charts).toHaveLength(6);
    expect(summary.filters).toHaveLength(2);
    expect(summary.layout.columns).toBe(3);
  });

  it("includes chart ids and types", () => {
    const summary = readSpec(sampleSpec);
    const kpi = summary.charts.find((c) => c.id === "total_revenue");
    expect(kpi).toBeDefined();
    expect(kpi!.type).toBe("kpi");
    expect(kpi!.label).toBe("Total Revenue");
  });

  it("includes filter details", () => {
    const summary = readSpec(sampleSpec);
    const dateFilter = summary.filters.find((f) => f.id === "date_range");
    expect(dateFilter).toBeDefined();
    expect(dateFilter!.type).toBe("date_range");
    expect(dateFilter!.column).toBe("date");
  });

  it("throws on missing file", () => {
    expect(() => readSpec("/nonexistent/path.yaml")).toThrow();
  });

  it("throws on invalid YAML spec", () => {
    const invalidPath = resolve(import.meta.dir, "../sample/sales.csv");
    expect(() => readSpec(invalidPath)).toThrow();
  });
});

describe("formatReadText", () => {
  it("formats a summary as human-readable text", () => {
    const summary = readSpec(sampleSpec);
    const text = formatReadText(summary);
    expect(text).toContain("Revenue by Region");
    expect(text).toContain("name: sales-dashboard");
    expect(text).toContain("source: ./sales.csv");
    expect(text).toContain("Charts (6):");
    expect(text).toContain("total_revenue (kpi)");
    expect(text).toContain("Filters (2):");
  });

  it("shows 'none' when no charts or filters", () => {
    const text = formatReadText({
      name: "empty",
      title: "Empty Dashboard",
      source: "./data.csv",
      chartCount: 0,
      charts: [],
      filters: [],
      layout: { columns: 3, rows: "auto" },
    });
    expect(text).toContain("Charts: none");
    expect(text).toContain("Filters: none");
  });
});
