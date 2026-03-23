import type { Database } from "bun:sqlite";
import type { FilterSpec } from "./schema";

interface FilterValues {
  [filterId: string]: string | [string, string];
}

interface InterpolationResult {
  sql: string;
  params: (string | number)[];
}

/**
 * Replace {{filter_id}} placeholders in a SQL query template
 * with parameterized conditions.
 */
export function interpolateFilters(
  queryTemplate: string,
  filters: FilterSpec[],
  filterValues: FilterValues
): InterpolationResult {
  let sql = queryTemplate;
  const params: (string | number)[] = [];

  for (const filter of filters) {
    const placeholder = `{{${filter.id}}}`;
    if (!sql.includes(placeholder)) continue;

    const value = filterValues[filter.id] ?? filter.default;

    if (filter.type === "date_range") {
      const [start, end] = Array.isArray(value) ? value : [value, value];
      sql = sql.replace(placeholder, `"${filter.column}" BETWEEN ? AND ?`);
      params.push(start, end);
    } else if (filter.type === "dropdown") {
      const v = Array.isArray(value) ? value[0] : value;
      if (v === "all") {
        sql = sql.replace(placeholder, "1=1");
      } else {
        sql = sql.replace(placeholder, `"${filter.column}" = ?`);
        params.push(v);
      }
    }
  }

  return { sql, params };
}

/**
 * Execute a chart query against the database, applying filter values.
 */
export function executeChartQuery(
  db: Database,
  queryTemplate: string,
  filters: FilterSpec[],
  filterValues: FilterValues
): Record<string, unknown>[] {
  const { sql, params } = interpolateFilters(queryTemplate, filters, filterValues);
  const stmt = db.prepare(sql);
  return stmt.all(...params) as Record<string, unknown>[];
}
