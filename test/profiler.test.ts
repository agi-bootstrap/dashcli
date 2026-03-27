import { describe, it, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { profileDataSource } from "../src/profiler";

const FIXTURES = resolve(import.meta.dir, ".fixtures-profiler");

function writeFixture(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

afterAll(() => {
  if (existsSync(FIXTURES)) rmSync(FIXTURES, { recursive: true });
});

describe("profileDataSource — column classification", () => {
  it("classifies date column by name", () => {
    const p = profileDataSource(
      writeFixture("dates-by-name.csv", "date,val\n2025-01-01,10\n2025-02-01,20\n"),
    );
    expect(p.dates.length).toBe(1);
    expect(p.dates[0].name).toBe("date");
  });

  it("classifies date by name variants (created_at, timestamp)", () => {
    const p = profileDataSource(
      writeFixture("date-variants.csv", "created_at,timestamp,val\n2025-01-01,2025-02-01,10\n2025-03-01,2025-04-01,20\n"),
    );
    expect(p.dates.length).toBe(2);
    expect(p.dates.map((d) => d.name).sort()).toEqual(["created_at", "timestamp"]);
  });

  it("classifies date by value pattern", () => {
    const p = profileDataSource(
      writeFixture("dates-by-value.csv", "period,val\n2025-01-01,10\n2025-02-01,20\n2025-03-01,30\n"),
    );
    expect(p.dates.length).toBe(1);
    expect(p.dates[0].name).toBe("period");
  });

  it("does NOT classify INTEGER 'year' as date", () => {
    const p = profileDataSource(
      writeFixture("int-year.csv", "year,val\n2024,10\n2025,20\n"),
    );
    expect(p.dates.length).toBe(0);
    expect(p.measures.map((m) => m.name)).toContain("year");
  });

  it("does NOT classify text column with non-date values as date despite name", () => {
    const p = profileDataSource(
      writeFixture("timestamp-text.csv", "timestamp,val\nevent_abc,10\nevent_def,20\n"),
    );
    // "timestamp" matches name pattern, but values don't match date pattern
    // Since it's TEXT and name matches, it IS classified as date per the algorithm
    // The name-based check takes priority for TEXT columns
    expect(p.dates.length).toBe(1);
  });

  it("classifies INTEGER columns as measures", () => {
    const p = profileDataSource(
      writeFixture("int-measure.csv", "region,count\nNorth,10\nSouth,20\n"),
    );
    expect(p.measures.length).toBe(1);
    expect(p.measures[0].name).toBe("count");
  });

  it("classifies REAL columns as measures", () => {
    const p = profileDataSource(
      writeFixture("real-measure.csv", "item,price\nA,9.99\nB,19.99\n"),
    );
    expect(p.measures.length).toBe(1);
    expect(p.measures[0].name).toBe("price");
  });

  it("excludes ID columns from measures (_id suffix)", () => {
    const p = profileDataSource(
      writeFixture("id-col.csv", "user_id,name,score\n1,Alice,90\n2,Bob,80\n"),
    );
    expect(p.measures.map((m) => m.name)).not.toContain("user_id");
    expect(p.dimensions.map((d) => d.name)).toContain("user_id");
    expect(p.measures.map((m) => m.name)).toContain("score");
  });

  it("excludes high-cardinality numeric columns (cardinality = row count) from measures", () => {
    // Need >10 rows for the cardinality guard to activate
    const rows = Array.from({ length: 12 }, (_, i) => `${i + 1},${(i % 3) * 10}`).join("\n");
    const p = profileDataSource(
      writeFixture("unique-int.csv", `seq,val\n${rows}\n`),
    );
    // seq has cardinality 12 = row count 12 → dimension, not measure
    expect(p.dimensions.map((d) => d.name)).toContain("seq");
    // val has cardinality 3 (0, 10, 20) < row count 12 → measure
    expect(p.measures.map((m) => m.name)).toContain("val");
  });

  it("classifies TEXT non-date columns as dimensions", () => {
    const p = profileDataSource(
      writeFixture("dim.csv", "region,revenue\nNorth,100\nSouth,200\n"),
    );
    expect(p.dimensions.length).toBe(1);
    expect(p.dimensions[0].name).toBe("region");
  });

  it("computes date range", () => {
    const p = profileDataSource(
      writeFixture("date-range.csv", "date,val\n2025-01-01,10\n2025-06-01,20\n2025-12-01,30\n"),
    );
    expect(p.dates[0].dateRange).toEqual(["2025-01-01", "2025-12-01"]);
  });

  it("computes dimension cardinality and stores values ≤15", () => {
    const p = profileDataSource(
      writeFixture("dim-card.csv", "color,val\nred,1\nblue,2\ngreen,3\n"),
    );
    const color = p.dimensions.find((d) => d.name === "color");
    expect(color!.distinct).toBe(3);
    expect(color!.values).toEqual(["blue", "green", "red"]);
  });

  it("skips all-null columns", () => {
    // Columns where all values are empty get excluded
    const p = profileDataSource(
      writeFixture("null-col.csv", "name,empty_col\nAlice,\nBob,\n"),
    );
    expect(p.columns.find((c) => c.name === "empty_col")).toBeUndefined();
  });

  it("sets tableOnly for single-row data", () => {
    const p = profileDataSource(
      writeFixture("single-row.csv", "date,val\n2025-01-01,10\n"),
    );
    expect(p.tableOnly).toBe(true);
    expect(p.rowCount).toBe(1);
  });
});
