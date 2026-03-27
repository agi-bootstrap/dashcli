import type { Database } from "bun:sqlite";
import { parse as parseYaml } from "yaml";
import { DashboardSpec } from "./schema";
import { executeChartQuery } from "./query";
import { renderDashboardHtml } from "./viewer";
import { loadDataSource } from "./datasource";
import { resolve, dirname } from "path";
import { readFileSync, watch } from "fs";

interface ServerContext {
  spec: DashboardSpec;
  db: Database;
  dropdownValues: Map<string, string[]>;
  sourcePath: string;
}

function computeDropdownValues(spec: DashboardSpec, db: Database, tableName: string): Map<string, string[]> {
  const dropdownValues = new Map<string, string[]>();
  for (const filter of spec.filters) {
    if (filter.type === "dropdown" || filter.type === "multi_select") {
      try {
        const col = filter.column.replace(/"/g, '""');
        const rows = db
          .prepare(`SELECT DISTINCT "${col}" FROM "${tableName}" ORDER BY "${col}"`)
          .all() as Record<string, unknown>[];
        dropdownValues.set(filter.id, rows.map((r) => String(r[filter.column])));
      } catch {
        dropdownValues.set(filter.id, []);
      }
    }
  }
  return dropdownValues;
}

export function loadDashboard(specPath: string): ServerContext {
  const raw = readFileSync(specPath, "utf-8");
  const parsed = parseYaml(raw);
  const spec = DashboardSpec.parse(parsed);

  const source = spec.source;
  let sourcePath: string;
  if (source.startsWith("/")) {
    sourcePath = source;
  } else {
    sourcePath = resolve(dirname(specPath), source);
  }

  const { db, tableName } = loadDataSource(sourcePath);
  const dropdownValues = computeDropdownValues(spec, db, tableName);
  return { spec, db, dropdownValues, sourcePath };
}

/**
 * Load a dashboard from an in-memory spec + data source path (no YAML file needed).
 */
export function loadDashboardFromSpec(
  spec: DashboardSpec,
  dataSourcePath: string,
): ServerContext {
  const { db, tableName } = loadDataSource(dataSourcePath);
  const dropdownValues = computeDropdownValues(spec, db, tableName);
  return { spec, db, dropdownValues, sourcePath: dataSourcePath };
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/**
 * Shared request handler for dashboard servers.
 * Used by both startServer (file-backed) and startServerFromSpec (in-memory).
 */
function createFetchHandler(
  getCtx: () => ServerContext,
  sseClients: Set<ReadableStreamDefaultController>,
) {
  return function fetch(req: Request): Response {
    const ctx = getCtx();
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/favicon.ico") {
      return new Response(null, { status: 204, headers: SECURITY_HEADERS });
    }

    // SSE endpoint for live reload
    if (path === `/api/events/${ctx.spec.name}`) {
      let ctrl: ReadableStreamDefaultController;
      const stream = new ReadableStream({
        start(controller) {
          ctrl = controller;
          sseClients.add(controller);
          controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
        },
        cancel() {
          sseClients.delete(ctrl);
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          ...SECURITY_HEADERS,
        },
      });
    }

    // Dashboard page
    if (path === "/" || path === `/d/${ctx.spec.name}`) {
      const html = renderDashboardHtml(ctx.spec);
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
      });
    }

    // Dropdown filter values API
    if (path === `/api/filters/${ctx.spec.name}`) {
      const values: Record<string, string[]> = {};
      for (const [id, vals] of ctx.dropdownValues) {
        values[id] = vals;
      }
      return Response.json(values, { headers: SECURITY_HEADERS });
    }

    // Chart data API
    const dataMatch = path.match(/^\/api\/data\/([^/]+)\/([^/]+)$/);
    if (dataMatch) {
      const [, dashName, chartId] = dataMatch;
      if (dashName !== ctx.spec.name) {
        return Response.json({ error: "Dashboard not found" }, { status: 404, headers: SECURITY_HEADERS });
      }

      const chart = ctx.spec.charts.find((c) => c.id === chartId);
      if (!chart) {
        return Response.json({ error: "Chart not found" }, { status: 404, headers: SECURITY_HEADERS });
      }

      const filterValues: Record<string, string | string[] | [string, string]> = {};
      for (const filter of ctx.spec.filters) {
        if (filter.type === "date_range") {
          const raw = url.searchParams.get(filter.id);
          if (raw) {
            const parts = raw.split(",");
            filterValues[filter.id] = [parts[0], parts[1] || parts[0]];
          }
        } else if (filter.type === "multi_select") {
          const values = url.searchParams.getAll(filter.id);
          if (values.length > 0) {
            filterValues[filter.id] = values;
          }
        } else if (filter.type === "range") {
          const raw = url.searchParams.get(filter.id);
          if (raw) {
            const parts = raw.split(",");
            filterValues[filter.id] = [parts[0], parts[1] || parts[0]];
          }
        } else {
          const raw = url.searchParams.get(filter.id);
          if (raw) {
            filterValues[filter.id] = raw;
          }
        }
      }

      try {
        const data = executeChartQuery(ctx.db, chart.query, ctx.spec.filters, filterValues);
        return Response.json(data, { headers: SECURITY_HEADERS });
      } catch (err: any) {
        console.error("Chart query error:", err.message);
        return Response.json({ error: "Query failed" }, { status: 500, headers: SECURITY_HEADERS });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: SECURITY_HEADERS });
  };
}

/**
 * Start the dashboard server from a spec file on disk.
 * Includes file watchers for live reload.
 */
export function startServer(specPath: string, port: number = 3838) {
  let ctx = loadDashboard(specPath);
  const sseClients = new Set<ReadableStreamDefaultController>();

  function broadcast(data: object) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const controller of sseClients) {
      try {
        controller.enqueue(msg);
      } catch {
        sseClients.delete(controller);
      }
    }
  }

  let reloadTimer: Timer | undefined;

  function watchFile(filePath: string, eventType: string) {
    let watcher: ReturnType<typeof watch>;
    try {
      watcher = watch(filePath, (event) => {
        reloadAndBroadcast(eventType);
        if (event === "rename") {
          watcher.close();
          setTimeout(() => watchFile(filePath, eventType), 100);
        }
      });
    } catch {
      // File may have been deleted (e.g., during test cleanup)
    }
  }

  function reloadAndBroadcast(eventType: string) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      try {
        const oldDb = ctx.db;
        ctx = loadDashboard(specPath);
        oldDb.close();
        broadcast({ type: eventType });
        console.log(`  ↻ Reloaded (${eventType})`);
      } catch (err: any) {
        console.error(`  ✗ Reload failed: ${err.message}`);
      }
    }, 200);
  }

  watchFile(specPath, "spec-change");
  watchFile(ctx.sourcePath, "data-change");

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: createFetchHandler(() => ctx, sseClients),
  });

  console.log(`\n  dashcli serving: ${ctx.spec.title}`);
  console.log(`  ${ctx.spec.charts.length} charts, ${ctx.spec.filters.length} filters`);
  console.log(`  live reload: watching spec + data files`);
  console.log(`\n  ➜  http://localhost:${server.port}/d/${ctx.spec.name}\n`);

  return server;
}

/**
 * Start the dashboard server from an in-memory spec (no YAML file on disk).
 * Used by the `dashboard` command to skip the YAML serialization round-trip.
 * Does not set up file watchers (no file to watch).
 */
export function startServerFromSpec(
  spec: DashboardSpec,
  dataSourcePath: string,
  port: number = 3838,
): ReturnType<typeof Bun.serve> {
  const ctx = loadDashboardFromSpec(spec, dataSourcePath);
  const sseClients = new Set<ReadableStreamDefaultController>();

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: createFetchHandler(() => ctx, sseClients),
  });

  console.log(`\n  dashcli serving: ${ctx.spec.title}`);
  console.log(`  ${ctx.spec.charts.length} charts, ${ctx.spec.filters.length} filters`);
  console.log(`\n  ➜  http://localhost:${server.port}/d/${ctx.spec.name}\n`);

  return server;
}
