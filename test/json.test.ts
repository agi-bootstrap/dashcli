import { describe, it, expect, afterAll } from "bun:test";
import { loadJson } from "../src/json";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";

const FIXTURES = resolve(import.meta.dir, ".fixtures-json");

function writeJson(name: string, data: unknown): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

describe("loadJson", () => {
  it("loads JSON array into SQLite with correct types", () => {
    const path = writeJson("types.json", [
      { name: "Alice", age: 30, score: 95.5 },
      { name: "Bob", age: 25, score: 88.0 },
    ]);
    const db = loadJson(path);
    const rows = db.prepare("SELECT * FROM types ORDER BY name").all() as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ name: "Alice", age: 30, score: 95.5 });
    expect(rows[1]).toEqual({ name: "Bob", age: 25, score: 88.0 });
    db.close();
  });

  it("handles null values", () => {
    const path = writeJson("nulls.json", [
      { id: 1, value: null },
      { id: 2, value: "hello" },
    ]);
    const db = loadJson(path);
    const rows = db.prepare("SELECT * FROM nulls ORDER BY id").all() as any[];
    expect(rows[0].value).toBeNull();
    expect(rows[1].value).toBe("hello");
    db.close();
  });

  it("handles boolean values as integers", () => {
    const path = writeJson("bools.json", [
      { name: "on", active: true },
      { name: "off", active: false },
    ]);
    const db = loadJson(path);
    const rows = db.prepare("SELECT * FROM bools ORDER BY name").all() as any[];
    expect(rows[1].active).toBe(1); // "on" sorts after "off"
    expect(rows[0].active).toBe(0);
    db.close();
  });

  it("derives table name from filename", () => {
    const path = writeJson("products.json", [{ id: 1, name: "Widget" }]);
    const db = loadJson(path);
    const rows = db.prepare("SELECT * FROM products").all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Widget");
    db.close();
  });

  it("throws on empty array", () => {
    const path = writeJson("empty.json", []);
    expect(() => loadJson(path)).toThrow(/non-empty array/);
  });

  it("throws on non-array JSON", () => {
    const path = writeJson("obj.json", { key: "value" });
    expect(() => loadJson(path)).toThrow(/non-empty array/);
  });

  it("throws on array of non-objects", () => {
    const path = writeJson("strings.json", ["a", "b", "c"]);
    expect(() => loadJson(path)).toThrow(/must be objects/);
  });

  it("throws on nested objects", () => {
    const path = writeJson("nested.json", [{ id: 1, address: { city: "NYC" } }]);
    expect(() => loadJson(path)).toThrow(/Nested objects and arrays are not supported/);
  });

  it("throws on nested arrays", () => {
    const path = writeJson("nested-arr.json", [{ id: 1, tags: ["a", "b"] }]);
    expect(() => loadJson(path)).toThrow(/Nested objects and arrays are not supported/);
  });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});
