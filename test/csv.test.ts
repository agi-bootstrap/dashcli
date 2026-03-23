import { describe, it, expect, afterAll } from "bun:test";
import { loadCsv, deriveTableName } from "../src/csv";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

const FIXTURES = resolve(import.meta.dir, ".fixtures");

function writeCsv(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

describe("loadCsv", () => {
  it("loads CSV into SQLite with correct types", () => {
    const path = writeCsv("types.csv", "name,age,score\nAlice,30,95.5\nBob,25,88.0\n");
    const db = loadCsv(path);
    const rows = db.prepare("SELECT * FROM types ORDER BY name").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", age: 30, score: 95.5 });
    expect(rows[1]).toEqual({ name: "Bob", age: 25, score: 88.0 });
    db.close();
  });

  it("handles quoted CSV fields with commas", () => {
    const path = writeCsv("quoted.csv", 'city,desc\n"New York","Big, busy city"\nLA,sunny\n');
    const db = loadCsv(path);
    const rows = db.prepare("SELECT * FROM quoted").all() as any[];
    expect(rows[0].desc).toBe("Big, busy city");
    db.close();
  });

  it("throws on empty CSV", () => {
    const path = writeCsv("empty.csv", "header_only\n");
    expect(() => loadCsv(path)).toThrow(/empty or has no data rows/);
  });

  it("derives table name from filename", () => {
    const path = writeCsv("products.csv", "id,name\n1,Widget\n");
    const db = loadCsv(path);
    const rows = db.prepare("SELECT * FROM products").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Widget");
    db.close();
  });

  it("loads the sample sales.csv correctly", () => {
    const path = resolve(import.meta.dir, "../sample/sales.csv");
    const db = loadCsv(path);
    const count = db.prepare("SELECT COUNT(*) as n FROM sales").get() as any;
    expect(count.n).toBeGreaterThan(0);
    const row = db.prepare("SELECT * FROM sales LIMIT 1").get() as any;
    expect(typeof row.revenue).toBe("number");
    expect(typeof row.deals).toBe("number");
    expect(typeof row.region).toBe("string");
    db.close();
  });
});

describe("deriveTableName", () => {
  it("strips .csv extension and returns base name", () => {
    expect(deriveTableName("/path/to/sales.csv")).toBe("sales");
  });

  it("handles uppercase .CSV extension", () => {
    expect(deriveTableName("/path/to/DATA.CSV")).toBe("DATA");
  });

  it("escapes double quotes in filename", () => {
    expect(deriveTableName('/path/to/my"table.csv')).toBe('my""table');
  });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});
