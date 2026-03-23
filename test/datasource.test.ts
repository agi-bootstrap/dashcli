import { describe, it, expect, afterAll } from "bun:test";
import { loadDataSource, deriveTableName } from "../src/datasource";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

const FIXTURES = resolve(import.meta.dir, ".fixtures-ds");

function writeFixture(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

describe("loadDataSource", () => {
  it("auto-detects CSV by extension", () => {
    const path = writeFixture("data.csv", "name,age\nAlice,30\n");
    const { db, tableName } = loadDataSource(path);
    expect(tableName).toBe("data");
    const rows = db.prepare("SELECT * FROM data").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Alice");
    db.close();
  });

  it("auto-detects JSON by extension", () => {
    const path = writeFixture("data.json", JSON.stringify([{ name: "Bob", age: 25 }]));
    const { db, tableName } = loadDataSource(path);
    expect(tableName).toBe("data");
    const rows = db.prepare("SELECT * FROM data").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Bob");
    db.close();
  });

  it("is case-insensitive on extension", () => {
    const path = writeFixture("upper.CSV", "x\n1\n");
    const { db } = loadDataSource(path);
    const rows = db.prepare("SELECT * FROM upper").all() as any[];
    expect(rows).toHaveLength(1);
    db.close();
  });

  it("throws on unsupported extension", () => {
    const path = writeFixture("data.xml", "<data/>");
    expect(() => loadDataSource(path)).toThrow(/Unsupported data source extension/);
  });

  it("throws on file with no extension", () => {
    const path = writeFixture("noext", "hello");
    expect(() => loadDataSource(path)).toThrow(/Unsupported data source extension/);
  });

  it("handles multi-dot filenames correctly", () => {
    const path = writeFixture("sales.2024.csv", "id,val\n1,100\n");
    const { db, tableName } = loadDataSource(path);
    expect(tableName).toBe("sales.2024");
    const rows = db.prepare(`SELECT * FROM "sales.2024"`).all() as any[];
    expect(rows).toHaveLength(1);
    db.close();
  });
});

describe("deriveTableName", () => {
  it("strips directory and extension", () => {
    expect(deriveTableName("/path/to/sales.csv")).toBe("sales");
    expect(deriveTableName("/path/to/data.json")).toBe("data");
  });

  it("escapes double quotes", () => {
    expect(deriveTableName('/path/to/my"file.csv')).toBe('my""file');
  });

  it("preserves dots in filename before known extension", () => {
    expect(deriveTableName("/path/to/sales.2024.csv")).toBe("sales.2024");
    expect(deriveTableName("/path/to/report.v2.json")).toBe("report.v2");
  });

  it("strips only known extensions", () => {
    expect(deriveTableName("/path/to/data.xml")).toBe("data.xml");
    expect(deriveTableName("/path/to/file.txt")).toBe("file.txt");
  });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});
