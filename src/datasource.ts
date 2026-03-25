import type { Database } from "bun:sqlite";
import { statSync } from "fs";
import { loadCsv } from "./csv";
import { loadJson } from "./json";

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface DataSourceResult {
  db: Database;
  tableName: string;
}

/**
 * A DataSource loads a file into an in-memory SQLite database.
 */
export interface DataSource {
  load(filePath: string): DataSourceResult;
}

/** Derive a SQL-safe table name from a file path (strip known extension). */
export function deriveTableName(filePath: string): string {
  const filename = filePath.split("/").pop()!;
  const ext = filename.match(/\.(csv|json)$/i)?.[0] ?? "";
  return filename.slice(0, filename.length - ext.length).replace(/"/g, '""');
}

const ADAPTERS: Record<string, (filePath: string) => Database> = {
  ".csv": loadCsv,
  ".json": loadJson,
};

/**
 * Auto-detect file type by extension and load into SQLite.
 * Throws if the extension is unsupported.
 */
export function loadDataSource(filePath: string): DataSourceResult {
  const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  const loader = ADAPTERS[ext];
  if (!loader) {
    const supported = Object.keys(ADAPTERS).join(", ");
    throw new Error(`Unsupported data source extension "${ext}". Supported: ${supported}`);
  }

  const fileSize = statSync(filePath).size;
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(0);
    throw new Error(
      `File too large: ${sizeMb} MB (limit: 100 MB). For large datasets, use a dedicated database tool like Aeolus or DuckDB.`
    );
  }

  return {
    db: loader(filePath),
    tableName: deriveTableName(filePath),
  };
}
