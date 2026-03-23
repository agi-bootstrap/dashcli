import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../src/server";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "fs";
import { stringify } from "yaml";
import type { Server } from "bun";

const FIXTURES = resolve(import.meta.dir, ".live-reload-fixtures");
const PORT = 3852;
let server: Server;
let specPath: string;
let csvPath: string;

function makeSpec(overrides: Record<string, unknown> = {}) {
  return {
    name: "live-test",
    title: "Live Reload Test",
    source: "./data.csv",
    layout: { columns: 1 },
    filters: [],
    charts: [
      { id: "total", type: "kpi", query: "SELECT SUM(val) as value FROM data", position: [0, 0, 1, 1] },
    ],
    ...overrides,
  };
}

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });
  csvPath = resolve(FIXTURES, "data.csv");
  writeFileSync(csvPath, "id,val\n1,10\n2,20\n");

  specPath = resolve(FIXTURES, "live-test.yaml");
  writeFileSync(specPath, stringify(makeSpec()));

  server = startServer(specPath, PORT);
});

afterAll(() => {
  server.stop();
  rmSync(FIXTURES, { recursive: true, force: true });
});

const base = `http://localhost:${PORT}`;

describe("SSE endpoint", () => {
  it("returns text/event-stream content type", async () => {
    const res = await fetch(`${base}/api/events/live-test`);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    // Close the stream
    await res.body?.cancel();
  });

  it("sends connected event on subscribe", async () => {
    const res = await fetch(`${base}/api/events/live-test`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('"type":"connected"');

    await reader.cancel();
  });

  it("includes security headers on SSE response", async () => {
    const res = await fetch(`${base}/api/events/live-test`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    await res.body?.cancel();
  });
});

describe("live reload via file changes", () => {
  it("reloads data when CSV changes and broadcasts data-change", async () => {
    // Connect SSE
    const res = await fetch(`${base}/api/events/live-test`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read the initial "connected" event
    await reader.read();

    // Modify the data file
    writeFileSync(csvPath, "id,val\n1,10\n2,20\n3,30\n");

    // Wait for debounced reload (200ms) + margin
    await new Promise((r) => setTimeout(r, 500));

    // Read the broadcast event
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('"type":"data-change"');

    // Verify the server picked up new data
    const dataRes = await fetch(`${base}/api/data/live-test/total`);
    const data = await dataRes.json();
    expect(data[0].value).toBe(60); // 10 + 20 + 30

    await reader.cancel();

    // Restore original data
    writeFileSync(csvPath, "id,val\n1,10\n2,20\n");
    await new Promise((r) => setTimeout(r, 500));
  });

  it("reloads spec when YAML changes and broadcasts spec-change", async () => {
    // Connect SSE
    const res = await fetch(`${base}/api/events/live-test`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read the initial "connected" event
    await reader.read();

    // Modify the spec (change title)
    writeFileSync(specPath, stringify(makeSpec({ title: "Updated Title" })));

    // Wait for debounced reload
    await new Promise((r) => setTimeout(r, 500));

    // Read the broadcast event
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain('"type":"spec-change"');

    // Verify the server picked up the new spec
    const htmlRes = await fetch(`${base}/`);
    const html = await htmlRes.text();
    expect(html).toContain("Updated Title");

    await reader.cancel();

    // Restore original spec
    writeFileSync(specPath, stringify(makeSpec()));
    await new Promise((r) => setTimeout(r, 500));
  });
});

describe("viewer SSE client code", () => {
  it("includes EventSource connection in rendered HTML", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    expect(html).toContain("EventSource");
    expect(html).toContain("/api/events/");
    expect(html).toContain("data-change");
    expect(html).toContain("spec-change");
  });

  it("includes debounced filter handler", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    expect(html).toContain("_filterTimer");
    expect(html).toContain("clearTimeout");
    expect(html).toContain("setTimeout");
  });

  it("guards SSE connection against file:// protocol", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    expect(html).toContain("window.location.protocol !== 'file:'");
  });
});

describe("reload error handling", () => {
  it("survives invalid YAML without crashing", async () => {
    // Write invalid YAML
    writeFileSync(specPath, "{{{{invalid yaml!!");

    // Wait for debounced reload
    await new Promise((r) => setTimeout(r, 500));

    // Server should still be running — existing data still served
    const res = await fetch(`${base}/api/data/live-test/total`);
    expect(res.status).toBe(200);

    // Restore valid spec
    writeFileSync(specPath, stringify(makeSpec()));
    await new Promise((r) => setTimeout(r, 500));
  });

  it("debounces rapid file changes into a single reload", async () => {
    // Connect SSE
    const res = await fetch(`${base}/api/events/live-test`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial connected event
    await reader.read();

    // Fire 5 rapid changes within the 200ms debounce window
    for (let i = 0; i < 5; i++) {
      writeFileSync(csvPath, `id,val\n1,${10 + i}\n`);
    }

    // Wait for the single debounced reload
    await new Promise((r) => setTimeout(r, 500));

    // Should get exactly one data-change event (not 5)
    const { value } = await reader.read();
    const text = decoder.decode(value);
    const events = text.split("\n\n").filter((e: string) => e.startsWith("data:"));
    expect(events.length).toBe(1);
    expect(text).toContain('"type":"data-change"');

    await reader.cancel();

    // Restore original data
    writeFileSync(csvPath, "id,val\n1,10\n2,20\n");
    await new Promise((r) => setTimeout(r, 500));
  });
});
