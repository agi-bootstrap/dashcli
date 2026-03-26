import type { Database } from "bun:sqlite";
import type { FilterSpec } from "./schema";
import { escId } from "./utils";

interface FilterValues {
  [filterId: string]: string | string[] | [string, string] | [number, number];
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

    const col = escId(filter.column);

    if (filter.type === "date_range") {
      const [start, end] = Array.isArray(value) ? value : [value, value];
      const replacement = `"${col}" BETWEEN ? AND ?`;
      const count = sql.split(placeholder).length - 1;
      sql = sql.replaceAll(placeholder, replacement);
      for (let i = 0; i < count; i++) params.push(start, end);
    } else if (filter.type === "dropdown") {
      const v = Array.isArray(value) ? value[0] : value;
      if (v === "all") {
        sql = sql.replaceAll(placeholder, "1=1");
      } else {
        const replacement = `"${col}" = ?`;
        const count = sql.split(placeholder).length - 1;
        sql = sql.replaceAll(placeholder, replacement);
        for (let i = 0; i < count; i++) params.push(v);
      }
    } else if (filter.type === "multi_select") {
      const values = Array.isArray(value) ? value.filter(v => typeof v === "string") : [String(value)];
      if (values.length === 0) {
        sql = sql.replaceAll(placeholder, "1=1");
      } else {
        const capped = values.slice(0, 100);
        const placeholders = capped.map(() => "?").join(", ");
        const replacement = `"${col}" IN (${placeholders})`;
        const count = sql.split(placeholder).length - 1;
        sql = sql.replaceAll(placeholder, replacement);
        for (let i = 0; i < count; i++) params.push(...capped);
      }
    } else if (filter.type === "range") {
      const raw = Array.isArray(value) ? value : [value, value];
      const min = Number(raw[0]);
      const max = Number(raw[1]);
      if (isNaN(min) || isNaN(max) || raw[0] === "" || raw[1] === "") {
        sql = sql.replaceAll(placeholder, "1=1");
      } else {
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        const replacement = `"${col}" BETWEEN ? AND ?`;
        const count = sql.split(placeholder).length - 1;
        sql = sql.replaceAll(placeholder, replacement);
        for (let i = 0; i < count; i++) params.push(lo, hi);
      }
    } else if (filter.type === "text") {
      const v = Array.isArray(value) ? String(value[0] ?? "") : String(value);
      if (!v) {
        sql = sql.replaceAll(placeholder, "1=1");
      } else {
        const escaped = v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        const replacement = `"${col}" LIKE ? ESCAPE '\\'`;
        const count = sql.split(placeholder).length - 1;
        sql = sql.replaceAll(placeholder, replacement);
        for (let i = 0; i < count; i++) params.push(`%${escaped}%`);
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
