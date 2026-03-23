import { describe, it, expect, afterAll } from "bun:test";
import { loadCsv } from "../src/csv";
import { executeChartQuery, interpolateFilters } from "../src/query";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import type { FilterSpec } from "../src/schema";

const FIXTURES = resolve(import.meta.dir, ".edge-fixtures");

function writeCsv(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});

describe("csv edge cases", () => {
  it("handles Windows-style CRLF line endings", () => {
    const path = writeCsv("crlf.csv", "a,b\r\n1,2\r\n3,4\r\n");
    const db = loadCsv(path);
    const rows = db.prepare("SELECT * FROM crlf").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].a).toBe(1);
    db.close();
  });

  it("coerces NaN integer values to original string", () => {
    const path = writeCsv("nan.csv", "id,val\n1,100\n2,not_a_number\n");
    const db = loadCsv(path);
    const rows = db.prepare("SELECT * FROM nan ORDER BY id").all() as any[];
    expect(rows[1].val).toBe("not_a_number");
    db.close();
  });

  it("handles column names that need SQL escaping", () => {
    const path = writeCsv("special-cols.csv", '"order",count\nfirst,10\nsecond,20\n');
    const db = loadCsv(path);
    const rows = db.prepare('SELECT "order", "count" FROM "special-cols"').all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].order).toBe("first");
    db.close();
  });
});

describe("query edge cases", () => {
  const filters: FilterSpec[] = [
    { id: "date_range", type: "date_range", column: "date", default: ["2025-01-01", "2025-12-31"] },
    { id: "region", type: "dropdown", column: "region", default: "all" },
  ];

  it("returns empty array for query with no matching rows", () => {
    const db = loadCsv(resolve(import.meta.dir, "../sample/sales.csv"));
    const data = executeChartQuery(
      db,
      "SELECT * FROM sales WHERE {{date_range}} AND {{region}}",
      filters,
      { date_range: ["2099-01-01", "2099-12-31"], region: "all" }
    );
    expect(data).toEqual([]);
    db.close();
  });

  it("handles date_range value passed as array", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{date_range}}",
      filters,
      { date_range: ["2025-06-01", "2025-06-30"] }
    );
    expect(result.sql).toContain("BETWEEN ? AND ?");
    expect(result.params).toEqual(["2025-06-01", "2025-06-30"]);
  });

  it("handles multiple occurrences of same placeholder", () => {
    const result = interpolateFilters(
      "SELECT * FROM t WHERE {{region}} UNION SELECT * FROM t WHERE {{region}}",
      filters,
      { region: "UK" }
    );
    expect(result.sql.match(/"region" = \?/g)?.length).toBe(2);
    expect(result.params).toEqual(["UK", "UK"]);
  });
});
