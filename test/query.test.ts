import { describe, it, expect } from "bun:test";
import { interpolateFilters, executeChartQuery } from "../src/query";
import { loadCsv } from "../src/csv";
import { resolve } from "path";
import type { FilterSpec } from "../src/schema";

const filters: FilterSpec[] = [
  { id: "date_range", type: "date_range", column: "date", default: ["2025-04-01", "2026-03-31"] },
  { id: "region", type: "dropdown", column: "region", default: "all" },
];

describe("interpolateFilters", () => {
  it("replaces date_range placeholder with BETWEEN", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{date_range}}",
      filters,
      { date_range: ["2025-06-01", "2025-06-30"] }
    );
    expect(result.sql).toContain("BETWEEN ? AND ?");
    expect(result.params).toEqual(["2025-06-01", "2025-06-30"]);
  });

  it("replaces dropdown=all with 1=1", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      filters,
      { region: "all" }
    );
    expect(result.sql).toContain("1=1");
    expect(result.params).toEqual([]);
  });

  it("replaces dropdown with specific value", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      filters,
      { region: "Europe" }
    );
    expect(result.sql).toContain('"region" = ?');
    expect(result.params).toEqual(["Europe"]);
  });

  it("handles both filters in one query", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{date_range}} AND {{region}}",
      filters,
      { date_range: ["2025-04-01", "2025-12-31"], region: "UK" }
    );
    expect(result.sql).toContain("BETWEEN ? AND ?");
    expect(result.sql).toContain('"region" = ?');
    expect(result.params).toEqual(["2025-04-01", "2025-12-31", "UK"]);
  });

  it("uses defaults when no value provided", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{date_range}} AND {{region}}",
      filters,
      {}
    );
    expect(result.params).toEqual(["2025-04-01", "2026-03-31"]);
    expect(result.sql).toContain("1=1");
  });
});

describe("executeChartQuery", () => {
  it("runs a query against loaded CSV data", () => {
    const db = loadCsv(resolve(import.meta.dir, "../sample/sales.csv"));
    const data = executeChartQuery(
      db,
      "SELECT SUM(revenue) as value FROM sales WHERE {{date_range}} AND {{region}}",
      filters,
      { date_range: ["2025-04-01", "2026-03-31"], region: "all" }
    );
    expect(data).toHaveLength(1);
    expect((data[0] as any).value).toBeGreaterThan(0);
    db.close();
  });

  it("filters by region correctly", () => {
    const db = loadCsv(resolve(import.meta.dir, "../sample/sales.csv"));
    const all = executeChartQuery(
      db,
      "SELECT SUM(revenue) as value FROM sales WHERE {{date_range}} AND {{region}}",
      filters,
      { date_range: ["2025-04-01", "2026-03-31"], region: "all" }
    );
    const europe = executeChartQuery(
      db,
      "SELECT SUM(revenue) as value FROM sales WHERE {{date_range}} AND {{region}}",
      filters,
      { date_range: ["2025-04-01", "2026-03-31"], region: "Europe" }
    );
    expect((all[0] as any).value).toBeGreaterThan((europe[0] as any).value);
    db.close();
  });

  it("groups by region and returns multiple rows", () => {
    const db = loadCsv(resolve(import.meta.dir, "../sample/sales.csv"));
    const data = executeChartQuery(
      db,
      "SELECT region, SUM(revenue) as revenue FROM sales WHERE {{date_range}} AND {{region}} GROUP BY region ORDER BY revenue DESC",
      filters,
      { date_range: ["2025-04-01", "2026-03-31"], region: "all" }
    );
    expect(data.length).toBeGreaterThanOrEqual(3);
    expect(data[0]).toHaveProperty("region");
    expect(data[0]).toHaveProperty("revenue");
    db.close();
  });
});

describe("new filter types", () => {
  const multiSelectFilter = { id: "region", type: "multi_select" as const, column: "region", default: [] as string[] };
  const rangeFilter = { id: "amount", type: "range" as const, column: "amount", default: [0, 1000] as [number, number] };
  const textFilter = { id: "search", type: "text" as const, column: "name", default: "" };

  it("multi_select with multiple values generates IN clause", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      [multiSelectFilter],
      { region: ["East", "West"] }
    );
    expect(result.sql).toContain('IN (?, ?)');
    expect(result.params).toEqual(["East", "West"]);
  });

  it("multi_select with empty array generates 1=1", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      [multiSelectFilter],
      { region: [] }
    );
    expect(result.sql).toContain("1=1");
    expect(result.params).toEqual([]);
  });

  it("multi_select with single value generates IN (?)", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      [multiSelectFilter],
      { region: ["East"] }
    );
    expect(result.sql).toContain('IN (?)');
    expect(result.params).toEqual(["East"]);
  });

  it("multi_select caps at 100 values", () => {
    const values = Array.from({ length: 150 }, (_, i) => "val" + i);
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}}",
      [multiSelectFilter],
      { region: values }
    );
    // Should have 100 ? placeholders
    const questionMarks = (result.sql.match(/\?/g) || []).length;
    expect(questionMarks).toBe(100);
    expect(result.params.length).toBe(100);
  });

  it("range generates BETWEEN with numeric params", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{amount}}",
      [rangeFilter],
      { amount: ["100", "500"] }
    );
    expect(result.sql).toContain("BETWEEN ? AND ?");
    expect(result.params).toEqual([100, 500]);
  });

  it("range swaps min > max", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{amount}}",
      [rangeFilter],
      { amount: ["500", "100"] }
    );
    expect(result.sql).toContain("BETWEEN ? AND ?");
    expect(result.params).toEqual([100, 500]);
  });

  it("range with empty values generates 1=1", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{amount}}",
      [rangeFilter],
      { amount: ["", ""] }
    );
    expect(result.sql).toContain("1=1");
    expect(result.params).toEqual([]);
  });

  it("range with NaN generates 1=1", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{amount}}",
      [rangeFilter],
      { amount: ["abc", "def"] }
    );
    expect(result.sql).toContain("1=1");
    expect(result.params).toEqual([]);
  });

  it("text generates LIKE with escaped wildcards", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{search}}",
      [textFilter],
      { search: "hello" }
    );
    expect(result.sql).toContain("LIKE ? ESCAPE");
    expect(result.params).toEqual(["%hello%"]);
  });

  it("text escapes % in value", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{search}}",
      [textFilter],
      { search: "10%" }
    );
    expect(result.params).toEqual(["%10\\%%"]);
  });

  it("text escapes _ in value", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{search}}",
      [textFilter],
      { search: "a_b" }
    );
    expect(result.params).toEqual(["%a\\_b%"]);
  });

  it("text with empty string generates 1=1", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{search}}",
      [textFilter],
      { search: "" }
    );
    expect(result.sql).toContain("1=1");
    expect(result.params).toEqual([]);
  });
});
