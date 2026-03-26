import { describe, it, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { buildSchemaSummary, parseYamlBlocks, validateSpec, suggestAI } from "../src/suggest";
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

  it("rejects bar chart without x/y", () => {
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

describe("suggestAI", () => {
  it("returns YAML string from mock client", async () => {
    const csvPath = writeFixture("sales-test.csv", "date,region,revenue,deals\n2025-01-01,North,10000,5\n2025-02-01,South,20000,10\n");

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
    type: bar
    query: "SELECT region, SUM(revenue) as revenue FROM \\"sales-test\\" GROUP BY region"
    x: region
    y: revenue
    label: Revenue by Region
    position: [1, 0, 2, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockYaml }],
        }),
      },
    };

    const result = await suggestAI(csvPath, { client: mockClient as any });
    expect(typeof result).toBe("string");
    expect(result).not.toContain("<SOURCE_PLACEHOLDER>");

    const parsed = parseYaml(result);
    const validated = DashboardSpec.safeParse(parsed);
    expect(validated.success).toBe(true);
  });

  it("returns multi-doc YAML with --- separators", async () => {
    const csvPath = writeFixture("multi.csv", "name,val\nA,1\nB,2\n");

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
    type: bar
    query: "SELECT name, val FROM multi"
    x: name
    y: val
    position: [0, 0, 2, 1]
\`\`\``;

    const mockClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: mockResponse }],
        }),
      },
    };

    const result = await suggestAI(csvPath, { client: mockClient as any });
    const docs = result.split("\n---\n");
    expect(docs.length).toBe(2);
  });

  it("skips invalid YAML blocks and keeps valid ones", async () => {
    const csvPath = writeFixture("skip-test.csv", "x,y\n1,2\n");

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

    const result = await suggestAI(csvPath, { client: mockClient as any });
    expect(result).toContain("valid-spec");
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
      suggestAI(csvPath, { client: mockClient as any }),
    ).rejects.toThrow("No valid YAML blocks found");
  });
});

afterAll(() => {
  rmSync(FIXTURES, { recursive: true, force: true });
});
