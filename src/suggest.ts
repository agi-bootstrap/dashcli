import Anthropic from "@anthropic-ai/sdk";
import { resolve, basename } from "path";
import { DashboardSpec, type ChartSpec, type FilterSpec } from "./schema";
import { loadDataSource } from "./datasource";
import { profileDataSource, type ProfileResult } from "./profiler";
import type { Database } from "bun:sqlite";
import { escId, humanizeLabel } from "./utils";
import * as yaml from "yaml";

// ─── Heuristic Path ───────────────────────────────────────────────────────────

const CURRENCY_RE = /revenue|price|cost|amount|salary|income|spend|budget/i;
const PERCENT_RE = /percent|rate|ratio|pct|proportion/i;
const MAX_TABLE_COLS = 20;

function kpiFormat(name: string): "currency" | "percent" | "number" {
  if (CURRENCY_RE.test(name)) return "currency";
  if (PERCENT_RE.test(name)) return "percent";
  return "number";
}

/**
 * Generate a dashboard spec from a profile result. Pure, deterministic, testable.
 */
export function generateSpec(
  profile: ProfileResult,
  csvBasename: string,
): DashboardSpec {
  const { tableName, dates, measures, dimensions, tableOnly } = profile;
  // tableName from deriveTableName is already escId'd — use directly in double-quotes
  const safeTable = tableName;
  const gridCols = Math.max(3, Math.min(measures.length, 4));

  // Derive name and title from basename
  const nameSlug = csvBasename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
  const title = humanizeLabel(csvBasename.replace(/\.[^.]+$/, ""));
  const sourceRef = `./${csvBasename}`;

  // Sort dimensions by cardinality ascending (fewer values = better bar chart axis)
  const sortedDims = [...dimensions].sort((a, b) => a.distinct - b.distinct);

  // Build filter placeholders
  const filters: FilterSpec[] = [];
  const filterIds: string[] = [];

  if (dates.length > 0 && !tableOnly) {
    const dateCol = dates[0];
    const filterId = dateCol.name.replace(/[^a-zA-Z0-9_]/g, "_");
    filters.push({
      id: filterId,
      type: "date_range",
      column: dateCol.name,
      default: dateCol.dateRange ?? ["", ""],
    });
    filterIds.push(filterId);
  }

  for (const dim of sortedDims) {
    if (dim.distinct <= 15 && !tableOnly) {
      const filterId = dim.name.replace(/[^a-zA-Z0-9_]/g, "_");
      filters.push({
        id: filterId,
        type: "dropdown",
        column: dim.name,
        default: "all",
      });
      filterIds.push(filterId);
    }
  }

  const whereClause =
    filterIds.length > 0
      ? filterIds.map((id) => `{{${id}}}`).join(" AND ")
      : "1=1";

  const charts: ChartSpec[] = [];
  let currentRow = 0;

  // Table-only mode: just a raw SELECT
  if (tableOnly || (measures.length === 0 && dimensions.length === 0)) {
    const allCols = profile.columns.slice(0, MAX_TABLE_COLS);
    const selectCols = allCols.map((c) => `"${escId(c.name)}"`).join(", ");
    charts.push({
      id: "detail_table",
      type: "table",
      query: `SELECT ${selectCols} FROM "${safeTable}" WHERE ${whereClause} LIMIT 100`,
      position: [0, 0, gridCols, 1] as [number, number, number, number],
      label: `${title} Detail`,
    });

    return DashboardSpec.parse({
      name: nameSlug,
      title,
      source: sourceRef,
      refresh: "manual",
      filters,
      layout: { columns: gridCols, rows: "auto" },
      charts,
    });
  }

  // Row 0: KPIs — one per measure, capped at grid width
  const kpiMeasures = measures.slice(0, gridCols);
  for (let i = 0; i < kpiMeasures.length; i++) {
    const m = kpiMeasures[i];
    const safeCol = escId(m.name);
    charts.push({
      id: `kpi_${m.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      type: "kpi",
      query: `SELECT SUM("${safeCol}") as value FROM "${safeTable}" WHERE ${whereClause}`,
      position: [i, currentRow, 1, 1] as [number, number, number, number],
      label: `Total ${humanizeLabel(m.name)}`,
      format: kpiFormat(m.name),
    });
  }
  currentRow++;

  // Row 1: Bar + Line charts — only if we have at least one measure
  const firstMeasure = measures[0];
  const hasBar = sortedDims.length > 0 && firstMeasure != null;
  const hasLine = dates.length > 0 && firstMeasure != null;

  if (hasBar && hasLine) {
    // Both: bar takes 2 cols, line takes 1
    const dim = sortedDims[0];
    const date = dates[0];
    charts.push({
      id: `bar_${dim.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      type: "bar",
      query: `SELECT "${escId(dim.name)}", SUM("${escId(firstMeasure.name)}") as "${escId(firstMeasure.name)}" FROM "${safeTable}" WHERE ${whereClause} GROUP BY "${escId(dim.name)}" ORDER BY "${escId(firstMeasure.name)}" DESC`,
      position: [0, currentRow, 2, 1] as [number, number, number, number],
      x: dim.name,
      y: firstMeasure.name,
      label: `${humanizeLabel(firstMeasure.name)} by ${humanizeLabel(dim.name)}`,
    });
    charts.push({
      id: `line_${date.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      type: "line",
      query: `SELECT "${escId(date.name)}", SUM("${escId(firstMeasure.name)}") as "${escId(firstMeasure.name)}" FROM "${safeTable}" WHERE ${whereClause} GROUP BY "${escId(date.name)}" ORDER BY "${escId(date.name)}"`,
      position: [2, currentRow, gridCols - 2, 1] as [number, number, number, number],
      x: date.name,
      y: firstMeasure.name,
      label: `${humanizeLabel(firstMeasure.name)} Trend`,
    });
  } else if (hasBar) {
    const dim = sortedDims[0];
    charts.push({
      id: `bar_${dim.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      type: "bar",
      query: `SELECT "${escId(dim.name)}", SUM("${escId(firstMeasure.name)}") as "${escId(firstMeasure.name)}" FROM "${safeTable}" WHERE ${whereClause} GROUP BY "${escId(dim.name)}" ORDER BY "${escId(firstMeasure.name)}" DESC`,
      position: [0, currentRow, gridCols, 1] as [number, number, number, number],
      x: dim.name,
      y: firstMeasure.name,
      label: `${humanizeLabel(firstMeasure.name)} by ${humanizeLabel(dim.name)}`,
    });
  } else if (hasLine) {
    const date = dates[0];
    charts.push({
      id: `line_${date.name.replace(/[^a-zA-Z0-9_]/g, "_")}`,
      type: "line",
      query: `SELECT "${escId(date.name)}", SUM("${escId(firstMeasure.name)}") as "${escId(firstMeasure.name)}" FROM "${safeTable}" WHERE ${whereClause} GROUP BY "${escId(date.name)}" ORDER BY "${escId(date.name)}"`,
      position: [0, currentRow, gridCols, 1] as [number, number, number, number],
      x: date.name,
      y: firstMeasure.name,
      label: `${humanizeLabel(firstMeasure.name)} Trend`,
    });
  }

  if (hasBar || hasLine) currentRow++;

  // Row 2: Detail table — GROUP BY all dims, SUM each measure
  const tableDims = sortedDims.slice(0, Math.min(sortedDims.length, MAX_TABLE_COLS - measures.length));
  const tableMeasures = measures.slice(0, Math.max(1, MAX_TABLE_COLS - tableDims.length));

  if (tableDims.length > 0) {
    const dimSelect = tableDims.map((d) => `"${escId(d.name)}"`).join(", ");
    const measureSelect = tableMeasures
      .map((m) => `SUM("${escId(m.name)}") as "${escId(m.name)}"`)
      .join(", ");
    const groupBy = tableDims.map((d) => `"${escId(d.name)}"`).join(", ");
    const orderBy = tableMeasures.length > 0 ? ` ORDER BY "${escId(tableMeasures[0].name)}" DESC` : "";
    charts.push({
      id: "detail_table",
      type: "table",
      query: `SELECT ${dimSelect}, ${measureSelect} FROM "${safeTable}" WHERE ${whereClause} GROUP BY ${groupBy}${orderBy}`,
      position: [0, currentRow, gridCols, 1] as [number, number, number, number],
      label: `${title} Detail`,
    });
  } else {
    // No dimensions — just show measures
    const measureSelect = tableMeasures
      .map((m) => `SUM("${escId(m.name)}") as "${escId(m.name)}"`)
      .join(", ");
    charts.push({
      id: "detail_table",
      type: "table",
      query: `SELECT ${measureSelect} FROM "${safeTable}" WHERE ${whereClause}`,
      position: [0, currentRow, gridCols, 1] as [number, number, number, number],
      label: `${title} Summary`,
    });
  }

  return DashboardSpec.parse({
    name: nameSlug,
    title,
    source: sourceRef,
    refresh: "manual",
    filters,
    layout: { columns: gridCols, rows: "auto" },
    charts,
  });
}

/**
 * Heuristic suggest: profile → generate spec → YAML string.
 * Synchronous, deterministic, no API key needed.
 */
export function suggest(sourcePath: string): string {
  const profile = profileDataSource(sourcePath);
  const base = basename(resolve(sourcePath));
  const spec = generateSpec(profile, base);
  return yaml.stringify(spec, { lineWidth: 0 });
}

// ─── LLM Path ─────────────────────────────────────────────────────────────────

/**
 * Analyze a data source's schema: column names, types, cardinality, value ranges.
 */
export function buildSchemaSummary(db: Database, tableName: string): string {
  const safeTable = escId(tableName);
  const columns = db.prepare(`PRAGMA table_info("${safeTable}")`).all() as {
    name: string;
    type: string;
  }[];

  const rowCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM "${safeTable}"`).get() as {
      cnt: number;
    }
  ).cnt;

  const lines: string[] = [`Table: ${tableName}`, `Rows: ${rowCount}`, `Columns:`];

  for (const col of columns) {
    const safeCol = escId(col.name);
    const distinct = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT "${safeCol}") as cnt FROM "${safeTable}"`,
        )
        .get() as { cnt: number }
    ).cnt;

    let detail = `  - ${col.name} (${col.type}, ${distinct} distinct values)`;

    if (col.type === "INTEGER" || col.type === "REAL") {
      const stats = db
        .prepare(
          `SELECT MIN("${safeCol}") as mn, MAX("${safeCol}") as mx, ROUND(AVG("${safeCol}"), 2) as avg FROM "${safeTable}"`,
        )
        .get() as { mn: number; mx: number; avg: number };
      detail += ` — range: ${stats.mn} to ${stats.mx}, avg: ${stats.avg}`;
    } else {
      const samples = db
        .prepare(
          `SELECT DISTINCT "${safeCol}" as val FROM "${safeTable}" LIMIT 10`,
        )
        .all() as { val: string }[];
      const vals = samples.map((s) => s.val);
      detail += ` — samples: ${vals.join(", ")}`;
    }

    lines.push(detail);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a dashboard design assistant. Given a data source schema, generate 3-5 dashboard YAML specs that would be useful for analyzing this data.

Each spec must follow this exact YAML format:

\`\`\`yaml
name: <unique-dashboard-name>
title: <human-readable title>
source: <SOURCE_PLACEHOLDER>
refresh: manual

filters:
  - id: <filter_id>
    type: date_range | dropdown | multi_select | range | text
    column: <column_name>
    default: ["start", "end"] | all | [] | [min, max] | ""

layout:
  columns: 3
  rows: auto

charts:
  - id: <chart_id>
    type: bar | line | kpi | table | pie | scatter | gauge | area | stacked_bar | heatmap | funnel
    query: "SELECT ... FROM <TABLE> WHERE {{filter_id}} ..."
    position: [col_start, row_start, col_span, row_span]
    x: <column>
    y: <column>
    group: <column>
    value: <column>
    label: <title>
    format: currency | number | percent
    min: 0
    max: 100
\`\`\`

Rules:
1. Use the exact table name provided in the schema summary. All SQL queries must reference this table.
2. Use \`source: <SOURCE_PLACEHOLDER>\` — it will be replaced with the actual file path.
3. Positions are 0-indexed [col_start, row_start, col_span, row_span]. Grid is 3 columns by default.
4. Charts of type bar, line, pie, scatter, area, stacked_bar, heatmap, funnel MUST have both x and y fields. stacked_bar also requires a group field. heatmap also requires a value field.
5. KPI charts should query a single "value" column (e.g., SELECT SUM(col) as value).
6. Gauge charts need min and max fields.
7. Filter placeholders use {{filter_id}} syntax in SQL queries. Only include filters you define.
8. Make each dashboard focus on a different analytical angle (overview, trends, breakdown, comparison, etc.).
9. Use realistic SQL queries that work with the columns in the schema.
10. Output ONLY the YAML specs, each in a separate \`\`\`yaml code block. No other text.`;

/**
 * Parse YAML blocks from Claude's response text.
 */
export function parseYamlBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```yaml[ \t]*\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

/**
 * Validate a parsed YAML object against the DashboardSpec schema.
 */
export function validateSpec(
  raw: unknown,
): { success: true; data: DashboardSpec } | { success: false; error: string } {
  const result = DashboardSpec.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error.message };
}

export interface SuggestOptions {
  /** Override the Anthropic client (for testing) */
  client?: Anthropic;
}

/**
 * LLM-powered suggest: call Anthropic API, return multi-doc YAML on stdout.
 * Requires ANTHROPIC_API_KEY.
 */
export async function suggestAI(
  sourcePath: string,
  options: SuggestOptions = {},
): Promise<string> {
  const resolvedSource = resolve(sourcePath);
  const { db, tableName } = loadDataSource(resolvedSource);

  let schemaSummary: string;
  try {
    schemaSummary = buildSchemaSummary(db, tableName);
  } finally {
    db.close();
  }

  const client = options.client ?? new Anthropic();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this data source and generate 3-5 dashboard YAML specs:\n\n${schemaSummary}`,
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    console.error("  Warning: API response was truncated. Some specs may be incomplete.");
  }

  const responseText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const yamlBlocks = parseYamlBlocks(responseText);
  if (yamlBlocks.length === 0) {
    throw new Error("No valid YAML blocks found in API response");
  }

  const sourceRef = `./${basename(resolvedSource)}`;
  const validSpecs: string[] = [];

  for (const block of yamlBlocks) {
    const replaced = block.replace(/<SOURCE_PLACEHOLDER>/g, sourceRef);
    let parsed: unknown;
    try {
      parsed = yaml.parse(replaced);
    } catch {
      console.error(`  Skipping invalid YAML block`);
      continue;
    }

    const result = validateSpec(parsed);
    if (!result.success) {
      console.error(`  Skipping spec: ${result.error}`);
      continue;
    }

    validSpecs.push(replaced);
  }

  if (validSpecs.length === 0) {
    throw new Error("No valid dashboard specs in API response");
  }

  // Multi-document YAML: separate specs with ---
  return validSpecs.join("\n---\n");
}
