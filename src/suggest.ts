import Anthropic from "@anthropic-ai/sdk";
import { resolve, dirname, basename, relative } from "path";
import { writeFileSync, mkdirSync } from "fs";
import { DashboardSpec } from "./schema";
import { loadDataSource } from "./datasource";
import type { Database } from "bun:sqlite";
import * as yaml from "yaml";

function escId(s: string): string {
  return s.replace(/"/g, '""');
}

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
    x: <column>        # required for bar, line, pie, scatter, area, stacked_bar, heatmap, funnel
    y: <column>        # required for bar, line, pie, scatter, area, stacked_bar, heatmap, funnel
    group: <column>    # required for stacked_bar
    value: <column>    # required for heatmap
    label: <title>
    format: currency | number | percent  # optional, for kpi/gauge/table
    min: 0             # optional, for gauge
    max: 100           # optional, for gauge
\`\`\`

Rules:
1. Use the exact table name provided in the schema summary. All SQL queries must reference this table.
2. Use \`source: <SOURCE_PLACEHOLDER>\` — it will be replaced with the actual file path.
3. Positions are 0-indexed [col_start, row_start, col_span, row_span]. Grid is 3 columns by default. Position values must avoid overlaps.
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
 * Returns the parsed spec or null if invalid.
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
  outDir?: string;
  /** Override the Anthropic client (for testing) */
  client?: Anthropic;
}

/**
 * Analyze a data source and generate suggested dashboard specs.
 */
export async function suggestDashboards(
  sourcePath: string,
  options: SuggestOptions = {},
): Promise<string[]> {
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

  const outDir = options.outDir
    ? resolve(options.outDir)
    : dirname(resolvedSource);
  mkdirSync(outDir, { recursive: true });
  const sourceRelPath = relative(outDir, resolvedSource);
  const sourceRef = sourceRelPath.startsWith(".") ? sourceRelPath : `./${sourceRelPath}`;
  const savedFiles: string[] = [];
  const usedNames = new Set<string>();

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

    const spec = result.data;
    // Sanitize LLM-generated name to prevent path traversal
    let safeName = spec.name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
    if (!safeName) {
      console.error(`  Skipping spec with invalid name: "${spec.name}"`);
      continue;
    }
    // Deduplicate names
    if (usedNames.has(safeName)) {
      let i = 2;
      while (usedNames.has(`${safeName}-${i}`)) i++;
      safeName = `${safeName}-${i}`;
    }
    usedNames.add(safeName);
    const outPath = resolve(outDir, `${safeName}.yaml`);
    writeFileSync(outPath, replaced);
    savedFiles.push(outPath);
    console.log(`  Saved: ${relative(process.cwd(), outPath)}`);
  }

  return savedFiles;
}
