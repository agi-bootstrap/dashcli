import type { Database } from "bun:sqlite";
import { parse as parseYaml } from "yaml";
import { DashboardSpec } from "./schema";
import { executeChartQuery } from "./query";
import { renderDashboardHtml } from "./viewer";
import { loadCsv } from "./csv";
import { resolve, dirname } from "path";
import { readFileSync } from "fs";

interface ServerContext {
  spec: DashboardSpec;
  db: Database;
  dropdownValues: Map<string, string[]>;
}

export function loadDashboard(specPath: string): ServerContext {
  const raw = readFileSync(specPath, "utf-8");
  const parsed = parseYaml(raw);
  const spec = DashboardSpec.parse(parsed);

  // Resolve CSV source relative to spec file
  const source = spec.source;
  let csvPath: string;
  if (source.startsWith("/")) {
    csvPath = source;
  } else {
    csvPath = resolve(dirname(specPath), source);
  }

  if (!csvPath.endsWith(".csv")) {
    throw new Error(`Phase 0 only supports CSV sources. Got: ${source}`);
  }

  const db = loadCsv(csvPath);

  // Pre-compute distinct values for dropdown filters
  const dropdownValues = new Map<string, string[]>();
  const tableName = csvPath.split("/").pop()!.replace(/\.csv$/i, "");
  for (const filter of spec.filters) {
    if (filter.type === "dropdown") {
      try {
        const rows = db
          .prepare(`SELECT DISTINCT "${filter.column}" FROM "${tableName}" ORDER BY "${filter.column}"`)
          .all() as Record<string, unknown>[];
        dropdownValues.set(filter.id, rows.map((r) => String(r[filter.column])));
      } catch {
        dropdownValues.set(filter.id, []);
      }
    }
  }

  return { spec, db, dropdownValues };
}

export function startServer(specPath: string, port: number = 3838) {
  const ctx = loadDashboard(specPath);
  const { spec, db, dropdownValues } = ctx;

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Dashboard page
      if (path === "/" || path === `/d/${spec.name}`) {
        const html = renderDashboardHtml(spec);
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Dropdown filter values API
      if (path === `/api/filters/${spec.name}`) {
        const values: Record<string, string[]> = {};
        for (const [id, vals] of dropdownValues) {
          values[id] = vals;
        }
        return Response.json(values);
      }

      // Chart data API
      const dataMatch = path.match(/^\/api\/data\/([^/]+)\/([^/]+)$/);
      if (dataMatch) {
        const [, dashName, chartId] = dataMatch;
        if (dashName !== spec.name) {
          return Response.json({ error: `Dashboard '${dashName}' not found` }, { status: 404 });
        }

        const chart = spec.charts.find((c) => c.id === chartId);
        if (!chart) {
          return Response.json({ error: `Chart '${chartId}' not found` }, { status: 404 });
        }

        // Parse filter values from query string
        const filterValues: Record<string, string | [string, string]> = {};
        for (const filter of spec.filters) {
          const raw = url.searchParams.get(filter.id);
          if (raw && filter.type === "date_range") {
            const parts = raw.split(",");
            filterValues[filter.id] = [parts[0], parts[1] || parts[0]];
          } else if (raw) {
            filterValues[filter.id] = raw;
          }
        }

        try {
          const data = executeChartQuery(db, chart.query, spec.filters, filterValues);
          return Response.json(data);
        } catch (err: any) {
          return Response.json({ error: err.message }, { status: 500 });
        }
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  console.log(`\n  dashcli serving: ${spec.title}`);
  console.log(`  ${spec.charts.length} charts, ${spec.filters.length} filters`);
  console.log(`\n  ➜  http://localhost:${server.port}/d/${spec.name}\n`);

  return server;
}
