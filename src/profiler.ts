import type { Database } from "bun:sqlite";
import { resolve } from "path";
import { loadDataSource } from "./datasource";
import { escId } from "./utils";

export type ColumnClass = "date" | "measure" | "dimension";

export interface ColumnProfile {
  name: string;
  sqlType: string;
  classification: ColumnClass;
  distinct: number;
  /** Distinct values for dimensions with ≤15 cardinality */
  values?: string[];
  /** Min/max for date columns */
  dateRange?: [string, string];
  /** Min/max for measure columns */
  numRange?: [number, number];
}

export interface ProfileResult {
  tableName: string;
  rowCount: number;
  columns: ColumnProfile[];
  dates: ColumnProfile[];
  measures: ColumnProfile[];
  dimensions: ColumnProfile[];
  tableOnly: boolean;
}

const DATE_NAME_RE = /date|time|month|year|created_at|updated_at|timestamp|_at$/i;
const DATE_VALUE_RE = /^\d{4}-\d{2}-\d{2}/;
const ID_NAME_RE = /_id$|_key$|^id$/i;

function classifyColumn(
  name: string,
  sqlType: string,
  distinct: number,
  rowCount: number,
  sampleValues: string[],
): ColumnClass {
  // ID guard: high-cardinality numeric columns with ID-like names are not measures
  if (
    (sqlType === "INTEGER" || sqlType === "REAL") &&
    ID_NAME_RE.test(name)
  ) {
    return "dimension";
  }

  // ID guard: numeric column where cardinality equals row count (likely an ID)
  // Only activate for datasets with >10 rows to avoid false positives on small CSVs
  if (
    (sqlType === "INTEGER" || sqlType === "REAL") &&
    rowCount > 10 &&
    distinct === rowCount
  ) {
    return "dimension";
  }

  // Date detection — only for TEXT columns
  if (sqlType === "TEXT") {
    // By name pattern
    if (DATE_NAME_RE.test(name)) return "date";
    // By value pattern: first 5 non-null values must all match
    const nonNull = sampleValues.filter((v) => v !== "");
    if (
      nonNull.length > 0 &&
      nonNull.slice(0, 5).every((v) => DATE_VALUE_RE.test(v))
    ) {
      return "date";
    }
  }

  // Measure detection
  if (sqlType === "INTEGER" || sqlType === "REAL") {
    return "measure";
  }

  // Everything else is a dimension
  return "dimension";
}

/**
 * Profile a data source: classify columns, compute cardinalities and ranges.
 * Works with any file type supported by loadDataSource (CSV, JSON).
 */
export function profileDataSource(sourcePath: string): ProfileResult {
  const resolvedPath = resolve(sourcePath);
  const { db, tableName } = loadDataSource(resolvedPath);

  try {
    return profileDb(db, tableName);
  } finally {
    db.close();
  }
}

/**
 * Profile an already-loaded database. Exported for testing.
 */
export function profileDb(db: Database, tableName: string): ProfileResult {
  // tableName from deriveTableName is already escId'd — use directly in quotes
  const safeTable = tableName;

  const columnsInfo = db
    .prepare(`PRAGMA table_info("${safeTable}")`)
    .all() as { name: string; type: string }[];

  const rowCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM "${safeTable}"`).get() as {
      cnt: number;
    }
  ).cnt;

  // Single query for all distinct counts — use index-based aliases to avoid escaping issues
  const distinctParts = columnsInfo.map(
    (c, i) => `COUNT(DISTINCT "${escId(c.name)}") as _col${i}`,
  );
  const distinctRow =
    distinctParts.length > 0
      ? (db
          .prepare(
            `SELECT ${distinctParts.join(", ")} FROM "${safeTable}"`,
          )
          .get() as Record<string, number>)
      : {};

  const columns: ColumnProfile[] = [];

  for (let colIdx = 0; colIdx < columnsInfo.length; colIdx++) {
    const col = columnsInfo[colIdx];
    const safeName = escId(col.name);
    const distinct = (distinctRow as Record<string, number>)[`_col${colIdx}`] ?? 0;

    // Sample values for classification
    const samples = db
      .prepare(
        `SELECT DISTINCT "${safeName}" as val FROM "${safeTable}" WHERE "${safeName}" IS NOT NULL AND "${safeName}" != '' LIMIT 10`,
      )
      .all() as { val: unknown }[];
    const sampleStrings = samples.map((s) => String(s.val));

    // Skip all-null columns
    if (distinct === 0 || sampleStrings.length === 0) continue;

    const classification = classifyColumn(
      col.name,
      col.type,
      distinct,
      rowCount,
      sampleStrings,
    );

    const profile: ColumnProfile = {
      name: col.name,
      sqlType: col.type,
      classification,
      distinct,
    };

    if (classification === "date") {
      const range = db
        .prepare(
          `SELECT MIN("${safeName}") as mn, MAX("${safeName}") as mx FROM "${safeTable}" WHERE "${safeName}" IS NOT NULL`,
        )
        .get() as { mn: string; mx: string };
      if (range.mn && range.mx) {
        profile.dateRange = [range.mn, range.mx];
      }
    }

    if (classification === "measure") {
      const range = db
        .prepare(
          `SELECT MIN("${safeName}") as mn, MAX("${safeName}") as mx FROM "${safeTable}" WHERE "${safeName}" IS NOT NULL`,
        )
        .get() as { mn: number; mx: number };
      profile.numRange = [range.mn, range.mx];
    }

    if (classification === "dimension" && distinct <= 15) {
      const vals = db
        .prepare(
          `SELECT DISTINCT "${safeName}" as val FROM "${safeTable}" WHERE "${safeName}" IS NOT NULL ORDER BY "${safeName}" LIMIT 15`,
        )
        .all() as { val: unknown }[];
      profile.values = vals.map((v) => String(v.val));
    }

    columns.push(profile);
  }

  const dates = columns.filter((c) => c.classification === "date");
  const measures = columns.filter((c) => c.classification === "measure");
  const dimensions = columns.filter((c) => c.classification === "dimension");

  return {
    tableName,
    rowCount,
    columns,
    dates,
    measures,
    dimensions,
    tableOnly: rowCount <= 1,
  };
}
