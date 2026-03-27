import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { diffSpecs, formatDiffText } from "../src/diff";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { resolve } from "path";
import { stringify as toYaml } from "yaml";

const tmpDir = resolve(import.meta.dir, "../.test-diff-tmp");

function makeSpec(overrides: Record<string, unknown> = {}) {
  return {
    name: "test-dash",
    title: "Test Dashboard",
    source: "./data.csv",
    layout: { columns: 3 },
    charts: [
      { id: "c1", type: "kpi", query: "SELECT 1 as value", position: [0, 0, 1, 1] },
      { id: "c2", type: "custom", query: "SELECT x, y FROM t", position: [1, 0, 1, 1], option: { series: [{ type: "bar", encode: { x: "x", y: "y" } }] } },
    ],
    filters: [
      { id: "f1", type: "dropdown", column: "region", default: "all" },
    ],
    ...overrides,
  };
}

function writeSpec(name: string, spec: Record<string, unknown>): string {
  const path = resolve(tmpDir, name);
  writeFileSync(path, toYaml(spec));
  return path;
}

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true });
});

describe("diffSpecs", () => {
  it("detects no changes for identical specs", () => {
    const specA = writeSpec("same-a.yaml", makeSpec());
    const specB = writeSpec("same-b.yaml", makeSpec());
    const diff = diffSpecs(specA, specB);
    expect(diff.hasChanges).toBe(false);
    expect(diff.charts).toHaveLength(0);
    expect(diff.filters).toHaveLength(0);
    expect(diff.topLevel).toHaveLength(0);
  });

  it("detects added charts", () => {
    const specA = writeSpec("add-a.yaml", makeSpec());
    const specB = writeSpec("add-b.yaml", makeSpec({
      charts: [
        ...makeSpec().charts,
        { id: "c3", type: "kpi", query: "SELECT 2 as value", position: [2, 0, 1, 1] },
      ],
    }));
    const diff = diffSpecs(specA, specB);
    expect(diff.hasChanges).toBe(true);
    const added = diff.charts.find((c) => c.id === "c3");
    expect(added).toBeDefined();
    expect(added!.type).toBe("added");
    expect(added!.chartType).toBe("kpi");
  });

  it("detects removed charts", () => {
    const specA = writeSpec("rm-a.yaml", makeSpec());
    const specB = writeSpec("rm-b.yaml", makeSpec({
      charts: [makeSpec().charts[0]],
    }));
    const diff = diffSpecs(specA, specB);
    const removed = diff.charts.find((c) => c.id === "c2");
    expect(removed).toBeDefined();
    expect(removed!.type).toBe("removed");
    expect(removed!.chartType).toBe("custom");
  });

  it("detects changed chart fields", () => {
    const charts = makeSpec().charts.map((c: any) =>
      c.id === "c1" ? { ...c, query: "SELECT 99 as value" } : c
    );
    const specA = writeSpec("chg-a.yaml", makeSpec());
    const specB = writeSpec("chg-b.yaml", makeSpec({ charts }));
    const diff = diffSpecs(specA, specB);
    const changed = diff.charts.find((c) => c.id === "c1");
    expect(changed).toBeDefined();
    expect(changed!.type).toBe("changed");
    expect(changed!.changedFields).toContain("query");
  });

  it("detects top-level scalar changes", () => {
    const specA = writeSpec("top-a.yaml", makeSpec());
    const specB = writeSpec("top-b.yaml", makeSpec({ title: "New Title" }));
    const diff = diffSpecs(specA, specB);
    const titleChange = diff.topLevel.find((c) => c.field === "title");
    expect(titleChange).toBeDefined();
    expect(titleChange!.from).toBe("Test Dashboard");
    expect(titleChange!.to).toBe("New Title");
  });

  it("detects filter changes", () => {
    const specA = writeSpec("filt-a.yaml", makeSpec());
    const specB = writeSpec("filt-b.yaml", makeSpec({
      filters: [{ id: "f1", type: "dropdown", column: "category", default: "all" }],
    }));
    const diff = diffSpecs(specA, specB);
    const changed = diff.filters.find((f) => f.id === "f1");
    expect(changed).toBeDefined();
    expect(changed!.type).toBe("changed");
    expect(changed!.changedFields).toContain("column");
  });
});

describe("formatDiffText", () => {
  it("shows 'No changes' when there are none", () => {
    const text = formatDiffText({ charts: [], filters: [], topLevel: [], hasChanges: false });
    expect(text).toContain("No changes");
  });

  it("formats chart changes with +/- symbols", () => {
    const specA = writeSpec("fmt-a.yaml", makeSpec());
    const specB = writeSpec("fmt-b.yaml", makeSpec({
      charts: [
        ...makeSpec().charts,
        { id: "c3", type: "kpi", query: "SELECT 2", position: [2, 0, 1, 1] },
      ],
    }));
    const diff = diffSpecs(specA, specB);
    const text = formatDiffText(diff);
    expect(text).toContain("+ c3 (added)");
  });
});
