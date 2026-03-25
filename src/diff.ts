/**
 * dashcli diff — compare two YAML specs and produce a structured changelog.
 * Diff is keyed by `id` for charts and filters.
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { DashboardSpec, type ChartSpec, type FilterSpec } from "./schema";

export type ChangeType = "added" | "removed" | "changed";

export interface ChartChange {
  id: string;
  type: ChangeType;
  chartType?: string;
  changedFields?: string[];
}

export interface FilterChange {
  id: string;
  type: ChangeType;
  filterType?: string;
  changedFields?: string[];
}

export interface ScalarChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface DiffResult {
  charts: ChartChange[];
  filters: FilterChange[];
  topLevel: ScalarChange[];
  hasChanges: boolean;
}

/** Parse and validate a spec file, returning the typed spec. */
function loadSpec(specPath: string): DashboardSpec {
  const raw = readFileSync(specPath, "utf-8");
  const parsed = parseYaml(raw);
  return DashboardSpec.parse(parsed);
}

/** Compare two specs and produce a structured diff. */
export function diffSpecs(specPathA: string, specPathB: string): DiffResult {
  const a = loadSpec(specPathA);
  const b = loadSpec(specPathB);

  const charts = diffById<ChartSpec, ChartChange>(
    a.charts,
    b.charts,
    (c) => c.id,
    diffChartFields,
    (c) => c.type,
    "chart",
  );

  const filters = diffById<FilterSpec, FilterChange>(
    a.filters,
    b.filters,
    (f) => f.id,
    diffFilterFields,
    (f) => f.type,
    "filter",
  );

  const topLevel = diffTopLevel(a, b);

  const hasChanges = charts.length > 0 || filters.length > 0 || topLevel.length > 0;

  return { charts, filters, topLevel, hasChanges };
}

/** Generic keyed diff: compare arrays by id. */
function diffById<T, C>(
  aItems: T[],
  bItems: T[],
  getId: (item: T) => string,
  getChangedFields: (a: T, b: T) => string[],
  getType: (item: T) => string,
  typeKey: string,
): C[] {
  const aMap = new Map(aItems.map((item) => [getId(item), item]));
  const bMap = new Map(bItems.map((item) => [getId(item), item]));
  const changes: any[] = [];

  // Removed: in A but not in B
  for (const [id, item] of aMap) {
    if (!bMap.has(id)) {
      changes.push({ id, type: "removed" as ChangeType, [`${typeKey}Type`]: getType(item) });
    }
  }

  // Added: in B but not in A
  for (const [id, item] of bMap) {
    if (!aMap.has(id)) {
      changes.push({ id, type: "added" as ChangeType, [`${typeKey}Type`]: getType(item) });
    }
  }

  // Changed: in both but different
  for (const [id, aItem] of aMap) {
    const bItem = bMap.get(id);
    if (!bItem) continue;
    const changedFields = getChangedFields(aItem, bItem);
    if (changedFields.length > 0) {
      changes.push({ id, type: "changed" as ChangeType, changedFields });
    }
  }

  return changes;
}

/** Compare chart fields (excluding id). */
function diffChartFields(a: ChartSpec, b: ChartSpec): string[] {
  const fields: string[] = [];
  if (a.type !== b.type) fields.push("type");
  if (a.query !== b.query) fields.push("query");
  if (a.x !== b.x) fields.push("x");
  if (a.y !== b.y) fields.push("y");
  if (a.label !== b.label) fields.push("label");
  if (a.format !== b.format) fields.push("format");
  if (a.min !== b.min) fields.push("min");
  if (a.max !== b.max) fields.push("max");
  if (a.group !== b.group) fields.push("group");
  if (a.value !== b.value) fields.push("value");
  if (JSON.stringify(a.position) !== JSON.stringify(b.position)) fields.push("position");
  return fields;
}

/** Compare filter fields (excluding id). */
function diffFilterFields(a: FilterSpec, b: FilterSpec): string[] {
  const fields: string[] = [];
  if (a.type !== b.type) fields.push("type");
  if (a.column !== b.column) fields.push("column");
  if (JSON.stringify(a.default) !== JSON.stringify(b.default)) fields.push("default");
  return fields;
}

/** Compare top-level scalar fields. */
function diffTopLevel(a: DashboardSpec, b: DashboardSpec): ScalarChange[] {
  const changes: ScalarChange[] = [];
  if (a.title !== b.title) changes.push({ field: "title", from: a.title, to: b.title });
  if (a.name !== b.name) changes.push({ field: "name", from: a.name, to: b.name });
  if (a.source !== b.source) changes.push({ field: "source", from: a.source, to: b.source });
  if (a.refresh !== b.refresh) changes.push({ field: "refresh", from: a.refresh, to: b.refresh });
  if (a.layout.columns !== b.layout.columns) {
    changes.push({ field: "layout.columns", from: a.layout.columns, to: b.layout.columns });
  }
  return changes;
}

/** Format a DiffResult as human-readable text. */
export function formatDiffText(diff: DiffResult): string {
  if (!diff.hasChanges) return "  No changes.";

  const lines: string[] = [];

  if (diff.topLevel.length > 0) {
    lines.push("  Top-level changes:");
    for (const c of diff.topLevel) {
      lines.push(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
    }
    lines.push("");
  }

  if (diff.charts.length > 0) {
    lines.push("  Chart changes:");
    for (const c of diff.charts) {
      if (c.type === "added") {
        lines.push(`    + ${c.id} (added)`);
      } else if (c.type === "removed") {
        lines.push(`    - ${c.id} (removed)`);
      } else {
        lines.push(`    ~ ${c.id} (changed: ${c.changedFields!.join(", ")})`);
      }
    }
    lines.push("");
  }

  if (diff.filters.length > 0) {
    lines.push("  Filter changes:");
    for (const c of diff.filters) {
      if (c.type === "added") {
        lines.push(`    + ${c.id} (added)`);
      } else if (c.type === "removed") {
        lines.push(`    - ${c.id} (removed)`);
      } else {
        lines.push(`    ~ ${c.id} (changed: ${c.changedFields!.join(", ")})`);
      }
    }
  }

  return lines.join("\n");
}
