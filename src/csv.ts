import { Database } from "bun:sqlite";
import { readFileSync } from "fs";

export function loadCsv(csvPath: string): Database {
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.trim().replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2) throw new Error(`CSV file is empty or has no data rows: ${csvPath}`);

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  // Derive table name from filename (sales.csv → sales)
  const tableName = deriveTableName(csvPath);

  const db = new Database(":memory:");

  // Infer column types by sampling up to 10 data rows
  const sampleRows = rows.slice(0, Math.min(10, rows.length));
  const columnTypes = headers.map((h, i) => {
    const samples = sampleRows.map((r) => r[i] ?? "").filter((s) => s !== "");
    return samples.length === 0 ? "TEXT" : inferSqliteTypeFromSamples(samples);
  });

  const colDefs = headers.map((h, i) => `"${escId(h)}" ${columnTypes[i]}`);
  db.run(`CREATE TABLE "${tableName}" (${colDefs.join(", ")})`);

  const placeholders = headers.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

  const insertAll = db.transaction((rows: string[][]) => {
    for (const row of rows) {
      const values = row.map((val, i) => coerceToType(val, columnTypes[i]));
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

/** Infer type from multiple samples — falls back to TEXT if any sample disagrees. */
function inferSqliteTypeFromSamples(samples: string[]): string {
  const types = samples.map(inferSqliteType);
  const unique = new Set(types);
  if (unique.size === 1) return types[0];
  // Mixed INTEGER/REAL → REAL; anything else → TEXT
  if (unique.size === 2 && unique.has("INTEGER") && unique.has("REAL")) return "REAL";
  return "TEXT";
}

function coerceToType(val: string, type: string): string | number | null {
  if (val === "") return null;
  if (type === "INTEGER") { const n = parseInt(val, 10); return isNaN(n) ? val : n; }
  if (type === "REAL") { const n = parseFloat(val); return isNaN(n) ? val : n; }
  return val;
}

/** Derive a SQL-safe table name from a CSV file path */
export function deriveTableName(csvPath: string): string {
  return escId(csvPath.split("/").pop()!.replace(/\.csv$/i, ""));
}

/** Escape a SQL identifier by doubling internal quotes */
function escId(s: string): string {
  return s.replace(/"/g, '""');
}
