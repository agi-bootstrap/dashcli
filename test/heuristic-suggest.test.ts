import { describe, it, expect, afterAll } from "bun:test";
import { resolve } from "path";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { parse as parseYaml } from "yaml";
import { generateSpec, suggest, validateSpec } from "../src/suggest";
import { profileDataSource } from "../src/profiler";
import { DashboardSpec } from "../src/schema";
import type { ProfileResult } from "../src/profiler";

const FIXTURES = resolve(import.meta.dir, ".fixtures-heuristic");

function writeFixture(name: string, content: string): string {
  mkdirSync(FIXTURES, { recursive: true });
  const path = resolve(FIXTURES, name);
  writeFileSync(path, content);
  return path;
}

afterAll(() => {
  if (existsSync(FIXTURES)) rmSync(FIXTURES, { recursive: true });
});

describe("generateSpec", () => {
  it("generates valid spec from sales.csv profile", () => {
    const profile = profileDataSource(
      writeFixture("gen-sales.csv", "date,region,product,revenue,deals\n2025-01-01,North,A,100,5\n2025-02-01,South,B,200,10\n2025-03-01,East,C,300,15\n"),
    );
    const spec = generateSpec(profile, "gen-sales.csv");
    const result = DashboardSpec.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it("generates KPIs for each measure", () => {
    const profile = profileDataSource(
      writeFixture("kpis.csv", "date,revenue,deals\n2025-01-01,100,5\n2025-02-01,200,10\n"),
    );
    const spec = generateSpec(profile, "kpis.csv");
    const kpis = spec.charts.filter((c) => c.type === "kpi");
    expect(kpis.length).toBe(2);
    expect(kpis[0].label).toBe("Total Revenue");
    expect(kpis[1].label).toBe("Total Deals");
  });

  it("generates date_range filter for date column", () => {
    const profile = profileDataSource(
      writeFixture("date-filter.csv", "date,val\n2025-01-01,10\n2025-12-01,20\n"),
    );
    const spec = generateSpec(profile, "date-filter.csv");
    const dateFilter = spec.filters.find((f) => f.type === "date_range");
    expect(dateFilter).toBeDefined();
    expect(dateFilter!.column).toBe("date");
  });

  it("generates dropdown filter for low-cardinality dimensions", () => {
    const profile = profileDataSource(
      writeFixture("dropdown-filter.csv", "region,val\nNorth,10\nSouth,20\nEast,30\n"),
    );
    const spec = generateSpec(profile, "dropdown-filter.csv");
    const dropdown = spec.filters.find((f) => f.type === "dropdown");
    expect(dropdown).toBeDefined();
    expect(dropdown!.column).toBe("region");
  });

  it("generates bar chart with dimension × measure", () => {
    const profile = profileDataSource(
      writeFixture("bar.csv", "region,revenue\nNorth,100\nSouth,200\n"),
    );
    const spec = generateSpec(profile, "bar.csv");
    const bar = spec.charts.find((c) => c.type === "bar");
    expect(bar).toBeDefined();
    expect(bar!.x).toBe("region");
    expect(bar!.y).toBe("revenue");
    expect(bar!.label).toContain("Revenue");
    expect(bar!.label).toContain("Region");
  });

  it("generates line chart with date × measure", () => {
    const profile = profileDataSource(
      writeFixture("line.csv", "date,revenue\n2025-01-01,100\n2025-02-01,200\n"),
    );
    const spec = generateSpec(profile, "line.csv");
    const line = spec.charts.find((c) => c.type === "line");
    expect(line).toBeDefined();
    expect(line!.x).toBe("date");
    expect(line!.y).toBe("revenue");
    expect(line!.label).toContain("Trend");
  });

  it("generates detail table spanning full width", () => {
    const profile = profileDataSource(
      writeFixture("table.csv", "region,revenue\nNorth,100\nSouth,200\n"),
    );
    const spec = generateSpec(profile, "table.csv");
    const table = spec.charts.find((c) => c.type === "table");
    expect(table).toBeDefined();
    expect(table!.position[2]).toBe(spec.layout.columns); // full width
  });

  it("no dimensions → no bar chart, line spans full width", () => {
    const profile = profileDataSource(
      writeFixture("no-dims.csv", "date,revenue\n2025-01-01,100\n2025-02-01,200\n"),
    );
    const spec = generateSpec(profile, "no-dims.csv");
    const bar = spec.charts.find((c) => c.type === "bar");
    const line = spec.charts.find((c) => c.type === "line");
    expect(bar).toBeUndefined();
    expect(line).toBeDefined();
    expect(line!.position[2]).toBe(spec.layout.columns); // full width
  });

  it("no dates → no line chart, bar spans full width", () => {
    const profile = profileDataSource(
      writeFixture("no-dates.csv", "region,revenue\nNorth,100\nSouth,200\n"),
    );
    const spec = generateSpec(profile, "no-dates.csv");
    const bar = spec.charts.find((c) => c.type === "bar");
    const line = spec.charts.find((c) => c.type === "line");
    expect(bar).toBeDefined();
    expect(bar!.position[2]).toBe(spec.layout.columns); // full width
    expect(line).toBeUndefined();
  });

  it("no measures → table only", () => {
    const profile = profileDataSource(
      writeFixture("no-measures.csv", "name,city\nAlice,NYC\nBob,LA\n"),
    );
    const spec = generateSpec(profile, "no-measures.csv");
    expect(spec.charts.length).toBe(1);
    expect(spec.charts[0].type).toBe("table");
  });

  it("single-row data → table only", () => {
    const profile = profileDataSource(
      writeFixture("single.csv", "date,region,revenue\n2025-01-01,North,100\n"),
    );
    const spec = generateSpec(profile, "single.csv");
    expect(spec.charts.length).toBe(1);
    expect(spec.charts[0].type).toBe("table");
  });

  it("uses currency format for revenue-like columns", () => {
    const profile = profileDataSource(
      writeFixture("currency.csv", "date,revenue\n2025-01-01,100\n2025-02-01,200\n"),
    );
    const spec = generateSpec(profile, "currency.csv");
    const kpi = spec.charts.find((c) => c.type === "kpi");
    expect(kpi!.format).toBe("currency");
  });

  it("derives name and title from basename", () => {
    const profile = profileDataSource(
      writeFixture("my-report.csv", "val\n10\n20\n"),
    );
    const spec = generateSpec(profile, "my-report.csv");
    expect(spec.name).toBe("my-report");
    expect(spec.title).toBe("My Report");
  });
});

describe("suggest — orchestrator", () => {
  it("returns valid YAML from sales CSV", () => {
    const csvPath = writeFixture(
      "orch-sales.csv",
      "date,region,revenue,deals\n2025-01-01,North,100,5\n2025-02-01,South,200,10\n",
    );
    const yamlStr = suggest(csvPath);
    const parsed = parseYaml(yamlStr);
    const result = DashboardSpec.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("produces deterministic output (same input → same output)", () => {
    const csvPath = writeFixture(
      "deterministic.csv",
      "date,region,revenue\n2025-01-01,North,100\n2025-02-01,South,200\n",
    );
    const result1 = suggest(csvPath);
    const result2 = suggest(csvPath);
    expect(result1).toBe(result2);
  });

  it("handles columns with special characters", () => {
    const csvPath = writeFixture(
      "special-chars.csv",
      '"col ""with"" quotes",val\nA,10\nB,20\n',
    );
    const yamlStr = suggest(csvPath);
    const parsed = parseYaml(yamlStr);
    const result = DashboardSpec.safeParse(parsed);
    expect(result.success).toBe(true);
  });
});

describe("suggest — CLI integration", () => {
  it("exits 1 with no args", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "suggest"], {
      cwd: resolve(import.meta.dir, ".."),
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  it("exits 1 for missing file", async () => {
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "suggest", "nonexistent.csv"], {
      cwd: resolve(import.meta.dir, ".."),
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  it("exits 0 and outputs valid YAML for valid CSV", async () => {
    const csvPath = writeFixture(
      "cli-test.csv",
      "date,region,revenue\n2025-01-01,North,100\n2025-02-01,South,200\n",
    );
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "suggest", csvPath], {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    const parsed = parseYaml(stdout);
    const result = DashboardSpec.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it("exits 1 for --ai without API key", async () => {
    const csvPath = writeFixture(
      "ai-no-key.csv",
      "date,val\n2025-01-01,10\n",
    );
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "suggest", csvPath, "--ai"], {
      cwd: resolve(import.meta.dir, ".."),
      stderr: "pipe",
      env: { ...process.env, ANTHROPIC_API_KEY: "" },
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
  });

  it("profile command outputs valid JSON", async () => {
    const csvPath = writeFixture(
      "cli-profile.csv",
      "date,region,revenue\n2025-01-01,North,100\n2025-02-01,South,200\n",
    );
    const proc = Bun.spawn(["bun", "run", "src/index.ts", "profile", csvPath], {
      cwd: resolve(import.meta.dir, ".."),
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);

    const stdout = await new Response(proc.stdout).text();
    const profile = JSON.parse(stdout);
    expect(profile.tableName).toBeDefined();
    expect(profile.dates).toBeInstanceOf(Array);
    expect(profile.measures).toBeInstanceOf(Array);
    expect(profile.dimensions).toBeInstanceOf(Array);
  });
});
