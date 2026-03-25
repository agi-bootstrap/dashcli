/**
 * dashcli read — parse a YAML spec and return a deterministic structured summary.
 * Pure function: no LLM, no data source, no network. Just spec parsing.
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { DashboardSpec } from "./schema";

export interface ReadSummary {
  name: string;
  title: string;
  source: string;
  chartCount: number;
  charts: { id: string; type: string; label?: string }[];
  filters: { id: string; type: string; column: string }[];
  layout: { columns: number; rows: string };
}

/** Parse a spec file and extract a structured summary. */
export function readSpec(specPath: string): ReadSummary {
  const raw = readFileSync(specPath, "utf-8");
  const parsed = parseYaml(raw);
  const spec = DashboardSpec.parse(parsed);

  return {
    name: spec.name,
    title: spec.title,
    source: spec.source,
    chartCount: spec.charts.length,
    charts: spec.charts.map((c) => ({
      id: c.id,
      type: c.type,
      ...(c.label ? { label: c.label } : {}),
    })),
    filters: spec.filters.map((f) => ({
      id: f.id,
      type: f.type,
      column: f.column,
    })),
    layout: {
      columns: spec.layout.columns,
      rows: String(spec.layout.rows),
    },
  };
}

/** Format a ReadSummary as human-readable text. */
export function formatReadText(summary: ReadSummary): string {
  const lines: string[] = [];
  lines.push(`  ${summary.title}`);
  lines.push(`  name: ${summary.name}`);
  lines.push(`  source: ${summary.source}`);
  lines.push(`  layout: ${summary.layout.columns} columns`);
  lines.push("");

  if (summary.charts.length > 0) {
    lines.push(`  Charts (${summary.chartCount}):`);
    for (const c of summary.charts) {
      const label = c.label ? ` — ${c.label}` : "";
      lines.push(`    ${c.id} (${c.type})${label}`);
    }
  } else {
    lines.push("  Charts: none");
  }

  lines.push("");

  if (summary.filters.length > 0) {
    lines.push(`  Filters (${summary.filters.length}):`);
    for (const f of summary.filters) {
      lines.push(`    ${f.id} (${f.type}) → ${f.column}`);
    }
  } else {
    lines.push("  Filters: none");
  }

  return lines.join("\n");
}
