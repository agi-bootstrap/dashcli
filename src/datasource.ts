import type { Database } from "bun:sqlite";
import { statSync } from "fs";
import { loadCsv } from "./csv";
import { loadJson } from "./json";
import { deriveTableName } from "./utils";
export { deriveTableName } from "./utils";

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
