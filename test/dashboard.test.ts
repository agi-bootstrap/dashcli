import { describe, test, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { profileDataSource } from "../src/profiler";
import { generateSpec } from "../src/suggest";
import { startServerFromSpec, loadDashboardFromSpec } from "../src/server";
import { basename } from "path";

const SAMPLE_CSV = resolve(import.meta.dir, "../sample/sales.csv");

describe("dashboard command (suggest → serve pipeline)", () => {
  const servers: ReturnType<typeof Bun.serve>[] = [];

  afterAll(() => {
    for (const s of servers) {
      try { s.stop(); } catch {}
    }
  });

  test("loadDashboardFromSpec loads spec without YAML round-trip", () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const ctx = loadDashboardFromSpec(spec, SAMPLE_CSV);

    expect(ctx.spec.name).toBe("sales");
    expect(ctx.spec.charts.length).toBeGreaterThan(0);
    expect(ctx.db).toBeDefined();
    ctx.db.close();
  });

  test("startServerFromSpec serves a working dashboard", async () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const server = startServerFromSpec(spec, SAMPLE_CSV, 3880);
    servers.push(server);

    // Dashboard page
    const dashRes = await fetch(`http://localhost:3880/d/${spec.name}`);
    expect(dashRes.status).toBe(200);
    const html = await dashRes.text();
    expect(html).toContain(spec.title);

    // Filter API
    const filterRes = await fetch(`http://localhost:3880/api/filters/${spec.name}`);
    expect(filterRes.status).toBe(200);
    const filters = await filterRes.json();
    expect(typeof filters).toBe("object");

    // Chart data API — first chart
    const firstChart = spec.charts[0];
    const dataRes = await fetch(`http://localhost:3880/api/data/${spec.name}/${firstChart.id}`);
    expect(dataRes.status).toBe(200);
    const data = await dataRes.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("end-to-end: suggest → in-memory serve → query returns data", async () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const server = startServerFromSpec(spec, SAMPLE_CSV, 3881);
    servers.push(server);

    // Verify every chart returns data
    for (const chart of spec.charts) {
      const res = await fetch(`http://localhost:3881/api/data/${spec.name}/${chart.id}`);
      expect(res.status).toBe(200);
      const rows = await res.json();
      expect(Array.isArray(rows)).toBe(true);
      // At least the sample CSV should produce non-empty results
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  test("root path redirects to dashboard", async () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const server = startServerFromSpec(spec, SAMPLE_CSV, 3882);
    servers.push(server);

    const res = await fetch("http://localhost:3882/");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("echarts");
  });

  test("nonexistent chart returns 404", async () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const server = startServerFromSpec(spec, SAMPLE_CSV, 3883);
    servers.push(server);

    const res = await fetch(`http://localhost:3883/api/data/${spec.name}/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("favicon returns 204", async () => {
    const profile = profileDataSource(SAMPLE_CSV);
    const spec = generateSpec(profile, basename(SAMPLE_CSV));
    const server = startServerFromSpec(spec, SAMPLE_CSV, 3884);
    servers.push(server);

    const res = await fetch("http://localhost:3884/favicon.ico");
    expect(res.status).toBe(204);
  });
});

describe("CLI dashboard command", () => {
  test("dashcli data.csv runs suggest + serve", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", SAMPLE_CSV, "--port", "3885"], {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    // Wait for server to start
    await Bun.sleep(1500);

    try {
      const res = await fetch("http://localhost:3885/");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("echarts");
      expect(html).toContain("Sales");
    } finally {
      proc.kill();
    }
  });

  test("dashcli dashboard data.csv also works", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "dashboard", SAMPLE_CSV, "--port", "3886"], {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    await Bun.sleep(1500);

    try {
      const res = await fetch("http://localhost:3886/");
      expect(res.status).toBe(200);
    } finally {
      proc.kill();
    }
  });

  test("dashcli nonexistent.csv shows clear error", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "nonexistent.csv"], {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });

    const code = await proc.exited;
    expect(code).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("File not found");
  });
});
