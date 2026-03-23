import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

export function loadJson(jsonPath: string): Database {
  const text = readFileSync(jsonPath, "utf-8");
  const data: unknown = JSON.parse(text);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`JSON file must contain a non-empty array of objects: ${jsonPath}`);
  }

  const first = data[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error(`JSON array elements must be objects: ${jsonPath}`);
  }

  const headers = Object.keys(first);
  if (headers.length === 0) {
    throw new Error(`JSON objects have no keys: ${jsonPath}`);
  }

  // Derive table name from filename (data.json → data)
  const tableName = escId(jsonPath.split("/").pop()!.replace(/\.json$/i, ""));

  const db = new Database(":memory:");

  // Infer column types from first row
  const colDefs = headers.map((h) => {
    const val = (first as Record<string, unknown>)[h];
    const type = inferSqliteType(val);
    return `"${escId(h)}" ${type}`;
  });

  db.run(`CREATE TABLE "${tableName}" (${colDefs.join(", ")})`);

  const placeholders = headers.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

  const insertAll = db.transaction((rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const values = headers.map((h) => coerce(row[h]));
      insert.run(...values);
    }
  });

  insertAll(data as Record<string, unknown>[]);
  return db;
}

function inferSqliteType(val: unknown): string {
  if (val === null || val === undefined) return "TEXT";
  if (typeof val === "boolean") return "INTEGER";
  if (typeof val === "number") {
    return Number.isInteger(val) ? "INTEGER" : "REAL";
  }
  return "TEXT";
}

function coerce(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "object") {
    throw new Error(`Nested objects and arrays are not supported as values`);
  }
  return String(val);
}

function escId(s: string): string {
  return s.replace(/"/g, '""');
}
