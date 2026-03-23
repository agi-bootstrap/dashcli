import type { Database } from "bun:sqlite";
import { loadCsv } from "./csv";
import { loadJson } from "./json";

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
  return {
    db: loader(filePath),
    tableName: deriveTableName(filePath),
  };
}
