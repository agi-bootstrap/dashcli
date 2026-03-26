import { describe, it, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import { buildSchemaSummary, parseYamlBlocks, validateSpec, suggestDashboards } from "../src/suggest";
import { loadDataSource } from "../src/datasource";
import { DashboardSpec } from "../src/schema";

const FIXTURES = resolve(import.meta.dir, ".fixtures-suggest");

function writeFixture(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

describe("buildSchemaSummary", () => {
  it("includes table name, row count, and columns", () => {
    const csvPath = writeFixture("summary.csv", "name,age,score\nAlice,30,95.5\nBob,25,88.0\n");
    const { db, tableName } = loadDataSource(csvPath);
    const summary = buildSchemaSummary(db, tableName);
    db.close();

    expect(summary).toContain("Table: summary");
    expect(summary).toContain("Rows: 2");
    expect(summary).toContain("name (TEXT");
    expect(summary).toContain("age (INTEGER");
    expect(summary).toContain("score (REAL");
  });

  it("shows distinct value count for columns", () => {
    const csvPath = writeFixture("distinct.csv", "region,val\nNorth,1\nSouth,2\nNorth,3\n");
    const { db, tableName } = loadDataSource(csvPath);
    const summary = buildSchemaSummary(db, tableName);
    db.close();

    expect(summary).toContain("region (TEXT, 2 distinct values)");
    expect(summary).toContain("val (INTEGER, 3 distinct values)");
  });

  it("shows min/max/avg for numeric columns", () => {
    const csvPath = writeFixture("numeric.csv", "x\n10\n20\n30\n");
    const { db, tableName } = loadDataSource(csvPath);
    const summary = buildSchemaSummary(db, tableName);
    db.close();

    expect(summary).toContain("range: 10 to 30");
    expect(summary).toContain("avg: 20");
  });

  it("shows sample values for text columns", () => {
    const csvPath = writeFixture("text.csv", "color\nred\nblue\ngreen\n");
    const { db, tableName } = loadDataSource(csvPath);
    const summary = buildSchemaSummary(db, tableName);
    db.close();

    expect(summary).toContain("samples:");
    expect(summary).toContain("red");
    expect(summary).toContain("blue");
  });

  it("works with JSON data source", () => {
    const jsonPath = writeFixture("data.json", JSON.stringify([
      { product: "Widget", price: 9.99, quantity: 100 },
      { product: "Gadget", price: 19.99, quantity: 50 },
    ]));
    const { db, tableName } = loadDataSource(jsonPath);
    const summary = buildSchemaSummary(db, tableName);
    db.close();

    expect(summary).toContain("Table: data");
    expect(summary).toContain("Rows: 2");
    expect(summary).toContain("product (TEXT");
    expect(summary).toContain("price (REAL");
  });
});

describe("parseYamlBlocks", () => {
  it("extracts yaml blocks from markdown", () => {
    const text = "Here are specs:\n```yaml\nname: test\n```\nAnd another:\n```yaml\nname: test2\n```\n";
    const blocks = parseYamlBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toBe("name: test");
    expect(blocks[1]).toBe("name: test2");
  });

  it("returns empty array when no yaml blocks found", () => {
    const blocks = parseYamlBlocks("No yaml here");
    expect(blocks).toHaveLength(0);
  });

  it("handles multiline yaml blocks", () => {
    const text = '```yaml\nname: test\ntitle: Test Dashboard\nsource: ./data.csv\n```\n';
    const blocks = parseYamlBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("name: test");
    expect(blocks[0]).toContain("title: Test Dashboard");
  });

  it("ignores non-yaml code blocks", () => {
    const text = "```json\n{}\n```\n```yaml\nname: test\n```\n```sql\nSELECT 1\n```\n";
    const blocks = parseYamlBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toBe("name: test");
  });
});

describe("validateSpec", () => {
  it("accepts a valid dashboard spec", () => {
    const spec = {
      name: "test-dash",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] }],
    };
    const result = validateSpec(spec);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("test-dash");
    }
  });

  it("rejects spec missing required fields", () => {
    const result = validateSpec({ name: "test" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeTruthy();
    }
  });

  it("rejects unknown chart type 'bar'", () => {
    const result = validateSpec({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      charts: [{ id: "c1", type: "bar", query: "SELECT 1", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts spec with filters", () => {
    const result = validateSpec({
      name: "test",
      title: "Test",
      source: "./data.csv",
      layout: { columns: 3 },
      filters: [{ id: "region", type: "dropdown", column: "region", default: "all" }],
      charts: [{ id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] }],
    });
    expect(result.success).toBe(true);
  });
});

describe("suggestDashboards", () => {
  it("generates specs from a CSV file using a mock client", async () => {
    const csvPath = writeFixture("sales-test.csv", "date,region,revenue,deals\n2025-01-01,North,10000,5\n2025-02-01,South,20000,10\n");
    const outDir = resolve(FIXTURES, "suggest-out");
    mkdirSync(outDir, { recursive: true });

    const mockYaml = `\`\`\`yaml
name: sales-overview
title: Sales Overview
source: <SOURCE_PLACEHOLDER>
refresh: manual

filters: []

layout:
  columns: 3
  rows: auto

charts:
  - id: total_revenue
    type: kpi
    query: "SELECT SUM(revenue) as value FROM \\"sales-test\\""
    label: Total Revenue
    format: currency
    position: [0, 0, 1, 1]

  - id: by_region
    type: custom
    query: "SELECT region, SUM(revenue) as revenue FROM \\"sales-test\\" GROUP BY region"
    label: Revenue by Region
    position: [1, 0, 2, 1]
    option:
      dataset: { source: "$rows" }
      xAxis: { type: category }
      yAxis: {}
      series:
        - type: bar
          encode: { x: region, y: revenue }
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockYaml }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, {
      outDir,
      client: mockClient as any,
    });

    expect(files).toHaveLength(1);
    expect(existsSync(files[0])).toBe(true);

    const content = readFileSync(files[0], "utf-8");
    expect(content).toContain("source: ../sales-test.csv");
    expect(content).not.toContain("<SOURCE_PLACEHOLDER>");

    const parsed = parseYaml(content);
    const result = DashboardSpec.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("skips invalid YAML blocks and keeps valid ones", async () => {
    const csvPath = writeFixture("skip-test.csv", "x,y\n1,2\n");
    const outDir = resolve(FIXTURES, "skip-out");
    mkdirSync(outDir, { recursive: true });

    const mockResponse = `\`\`\`yaml
name: valid-spec
title: Valid
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
\`\`\`

\`\`\`yaml
not: valid: yaml: [broken
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, {
      outDir,
      client: mockClient as any,
    });

    expect(files).toHaveLength(1);
  });

  it("skips specs that fail Zod validation", async () => {
    const csvPath = writeFixture("zod-fail.csv", "a,b\n1,2\n");
    const outDir = resolve(FIXTURES, "zod-out");
    mkdirSync(outDir, { recursive: true });

    const mockResponse = `\`\`\`yaml
name: missing-title
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
charts:
  - id: c1
    type: kpi
    query: "SELECT 1"
    position: [0, 0, 1, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, {
      outDir,
      client: mockClient as any,
    });

    // Missing 'title' field should cause validation failure
    expect(files).toHaveLength(0);
  });

  it("throws when API returns no yaml blocks", async () => {
    const csvPath = writeFixture("no-blocks.csv", "x\n1\n");

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: "No dashboards possible." }],
        }),
      },
    };

    expect(
      suggestDashboards(csvPath, { client: mockClient as any }),
    ).rejects.toThrow("No valid YAML blocks found");
  });

  it("sanitizes spec names to prevent path traversal", async () => {
    const csvPath = writeFixture("traversal.csv", "x\n1\n");
    const outDir = resolve(FIXTURES, "traversal-out");
    mkdirSync(outDir, { recursive: true });

    const mockResponse = `\`\`\`yaml
name: ../../etc/evil
title: Traversal Attempt
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, {
      outDir,
      client: mockClient as any,
    });

    expect(files).toHaveLength(1);
    // Should be sanitized to a safe filename within outDir
    expect(files[0]).toContain("traversal-out");
    expect(files[0]).not.toContain("..");
    expect(files[0]).toEndWith("etc-evil.yaml");
  });

  it("warns on truncated API response (max_tokens)", async () => {
    const csvPath = writeFixture("trunc.csv", "x\n1\n");
    const outDir = resolve(FIXTURES, "trunc-out");
    mkdirSync(outDir, { recursive: true });

    const mockYaml = `\`\`\`yaml
name: trunc-spec
title: Truncated
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          stop_reason: "max_tokens",
          content: [{ type: "text" as const, text: mockYaml }],
        }),
      },
    };

    const origError = console.error;
    const errors: string[] = [];
    console.error = (...args: any[]) => errors.push(args.join(" "));
    try {
      const files = await suggestDashboards(csvPath, { outDir, client: mockClient as any });
      expect(files).toHaveLength(1);
      expect(errors.some((e) => e.includes("truncated"))).toBe(true);
    } finally {
      console.error = origError;
    }
  });

  it("deduplicates identical spec names", async () => {
    const csvPath = writeFixture("dedup.csv", "x\n1\n");
    const outDir = resolve(FIXTURES, "dedup-out");
    mkdirSync(outDir, { recursive: true });

    const block = (name: string) => `\`\`\`yaml
name: ${name}
title: Dedup Test
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: block("same") + "\n" + block("same") }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, { outDir, client: mockClient as any });
    expect(files).toHaveLength(2);
    expect(files[0]).toContain("same.yaml");
    expect(files[1]).toContain("same-2.yaml");
  });

  it("skips specs whose name sanitizes to empty string", async () => {
    const csvPath = writeFixture("emptyname.csv", "x\n1\n");
    const outDir = resolve(FIXTURES, "emptyname-out");
    mkdirSync(outDir, { recursive: true });

    const mockResponse = `\`\`\`yaml
name: "..."
title: Dots Only
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT 1 as value"
    position: [0, 0, 1, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, { outDir, client: mockClient as any });
    expect(files).toHaveLength(0);
  });

  it("generates multiple specs from a single response", async () => {
    const csvPath = writeFixture("multi.csv", "name,val\nA,1\nB,2\n");
    const outDir = resolve(FIXTURES, "multi-out");
    mkdirSync(outDir, { recursive: true });

    const mockResponse = `\`\`\`yaml
name: dash-one
title: Dashboard One
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 3
  rows: auto
charts:
  - id: c1
    type: kpi
    query: "SELECT SUM(val) as value FROM multi"
    position: [0, 0, 1, 1]
\`\`\`

\`\`\`yaml
name: dash-two
title: Dashboard Two
source: <SOURCE_PLACEHOLDER>
layout:
  columns: 2
  rows: auto
charts:
  - id: c1
    type: custom
    query: "SELECT name, val FROM multi"
    position: [0, 0, 2, 1]
    option:
      dataset: { source: "$rows" }
      xAxis: { type: category }
      yAxis: {}
      series:
        - type: bar
          encode: { x: name, y: val }
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const files = await suggestDashboards(csvPath, {
      outDir,
      client: mockClient as any,
    });

    expect(files).toHaveLength(2);
    expect(files[0]).toContain("dash-one.yaml");
    expect(files[1]).toContain("dash-two.yaml");
  });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});
