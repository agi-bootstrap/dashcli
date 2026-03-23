import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startServer } from "../src/server";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { stringify } from "yaml";
import type { Server } from "bun";

const FIXTURES = resolve(import.meta.dir, ".error-fixtures");
const PORT = 3841;
let server: Server;

beforeAll(() => {
  mkdirSync(FIXTURES, { recursive: true });

  // Create a CSV
  writeFileSync(resolve(FIXTURES, "data.csv"), "id,val\n1,10\n2,20\n");

  // Create a spec with a broken query that will cause a SQL error
  const spec = {
    name: "errtest",
    title: "Error Test",
    source: "./data.csv",
    layout: { columns: 1 },
    filters: [],
    charts: [
      { id: "bad_query", type: "kpi", query: "SELECT * FROM nonexistent_table", position: [0, 0, 1, 1] },
    ],
  };
  writeFileSync(resolve(FIXTURES, "errtest.yaml"), stringify(spec));

  server = startServer(resolve(FIXTURES, "errtest.yaml"), PORT);
});

afterAll(() => {
  server.stop();
  rmSync(FIXTURES, { recursive: true, force: true });
});

describe("server error masking (#9)", () => {
  it("returns generic error, not SQL details", async () => {
    const res = await fetch(`http://localhost:${PORT}/api/data/errtest/bad_query`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Query failed");
    expect(body.error).not.toContain("nonexistent_table");
    expect(body.error).not.toContain("no such table");
  });
});
