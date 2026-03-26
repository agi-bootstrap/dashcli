import type { Database } from "bun:sqlite";
import { loadCsv } from "./csv";
import { loadJson } from "./json";
import { deriveTableName } from "./utils";
export { deriveTableName } from "./utils";

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
  return {
    db: loader(filePath),
    tableName: deriveTableName(filePath),
  };
}
