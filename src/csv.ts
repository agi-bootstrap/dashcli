import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

export function loadCsv(csvPath: string): Database {
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error(`CSV file is empty or has no data rows: ${csvPath}`);

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  // Derive table name from filename (sales.csv → sales)
  const tableName = csvPath.split("/").pop()!.replace(/\.csv$/i, "");

  const db = new Database(":memory:");

  // Infer column types from first data row
  const colDefs = headers.map((h, i) => {
    const sample = rows[0]?.[i] ?? "";
    const type = inferSqliteType(sample);
    return `"${h}" ${type}`;
  });

  db.run(`CREATE TABLE "${tableName}" (${colDefs.join(", ")})`);

  const placeholders = headers.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

  const insertAll = db.transaction((rows: string[][]) => {
    for (const row of rows) {
      const values = row.map((val, i) => coerce(val, headers[i], rows[0]?.[i] ?? ""));
      insert.run(...values);
    }
  });

  insertAll(rows);
  return db;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function inferSqliteType(sample: string): string {
  if (sample === "") return "TEXT";
  if (!isNaN(Number(sample)) && sample !== "") {
    return sample.includes(".") ? "REAL" : "INTEGER";
  }
  return "TEXT";
}

function coerce(val: string, _header: string, sample: string): string | number | null {
  if (val === "") return null;
  const type = inferSqliteType(sample);
  if (type === "INTEGER") return parseInt(val, 10);
  if (type === "REAL") return parseFloat(val);
  return val;
}
