import { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import { escId, deriveTableName } from "./utils";

export function loadCsv(csvPath: string): Database {
  const text = readFileSync(csvPath, "utf-8");
  const lines = text.trim().replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 2) throw new Error(`CSV file is empty or has no data rows: ${csvPath}`);

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);

  const tableName = deriveTableName(csvPath);

  const db = new Database(":memory:");

  // Infer column types by sampling up to 10 non-empty values per column
  const colTypes = headers.map((_h, i) => {
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const val = rows[r]?.[i] ?? "";
      if (val !== "") return inferSqliteType(val);
    }
    return "TEXT"; // all sampled values empty
  });

  const colDefs = headers.map((h, i) => {
    return `"${escId(h)}" ${colTypes[i]}`;
  });

  db.run(`CREATE TABLE "${tableName}" (${colDefs.join(", ")})`);

  const placeholders = headers.map(() => "?").join(", ");
  const insert = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

  const insertAll = db.transaction((dataRows: string[][]) => {
    for (const row of dataRows) {
      const values = row.map((val, i) => coerceByType(val, colTypes[i]));
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

function coerceByType(val: string, type: string): string | number | null {
  if (val === "") return null;
  if (type === "INTEGER") { const n = parseInt(val, 10); return isNaN(n) ? val : n; }
  if (type === "REAL") { const n = parseFloat(val); return isNaN(n) ? val : n; }
  return val;
}

// Re-export for backward compatibility with tests
export { deriveTableName } from "./utils";
