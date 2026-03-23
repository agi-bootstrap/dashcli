import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../src/server";
import { resolve } from "path";
import type { Server } from "bun";

let server: Server;
const PORT = 3839;

beforeAll(() => {
  server = startServer(resolve(import.meta.dir, "../sample/sales-dashboard.yaml"), PORT);
});

afterAll(() => {
  server.stop();
});

const base = `http://localhost:${PORT}`;

describe("server routes", () => {
  it("serves dashboard HTML at /d/:name", async () => {
    const res = await fetch(`${base}/d/sales-dashboard`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Revenue by Region");
    expect(html).toContain("echarts");
  });

  it("serves dashboard HTML at /", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Revenue by Region");
  });

  it("returns 404 for unknown dashboard", async () => {
    const res = await fetch(`${base}/d/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("returns filter values JSON", async () => {
    const res = await fetch(`${base}/api/filters/sales-dashboard`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.region).toBeInstanceOf(Array);
    expect(data.region.length).toBeGreaterThan(0);
  });

  it("returns chart data for KPI", async () => {
    const res = await fetch(`${base}/api/data/sales-dashboard/total_revenue?date_range=2025-04-01,2026-03-31&region=all`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].value).toBeGreaterThan(0);
  });

  it("returns chart data for bar chart", async () => {
    const res = await fetch(`${base}/api/data/sales-dashboard/by_region?date_range=2025-04-01,2026-03-31&region=all`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThanOrEqual(3);
    expect(data[0]).toHaveProperty("region");
    expect(data[0]).toHaveProperty("revenue");
  });

  it("returns chart data for table", async () => {
    const res = await fetch(`${base}/api/data/sales-dashboard/detail_table?date_range=2025-04-01,2026-03-31&region=all`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("product_category");
  });

  it("filters data by region", async () => {
    const allRes = await fetch(`${base}/api/data/sales-dashboard/total_revenue?date_range=2025-04-01,2026-03-31&region=all`);
    const europeRes = await fetch(`${base}/api/data/sales-dashboard/total_revenue?date_range=2025-04-01,2026-03-31&region=Europe`);
    const allData = await allRes.json();
    const europeData = await europeRes.json();
    expect(allData[0].value).toBeGreaterThan(europeData[0].value);
  });

  it("returns 404 for unknown chart", async () => {
    const res = await fetch(`${base}/api/data/sales-dashboard/nonexistent?date_range=2025-04-01,2026-03-31&region=all`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  it("returns 404 for unknown dashboard in API", async () => {
    const res = await fetch(`${base}/api/data/unknown/total_revenue?date_range=2025-04-01,2026-03-31&region=all`);
    expect(res.status).toBe(404);
  });

  it("does not reflect URL input in error messages (#8)", async () => {
    const payload = "<script>alert(1)</script>";
    const res = await fetch(`${base}/api/data/${encodeURIComponent(payload)}/x`);
    const data = await res.json();
    expect(data.error).not.toContain(payload);
    expect(data.error).toBe("Dashboard not found");
  });
});
