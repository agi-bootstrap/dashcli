import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, readFileSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dir, "..");
const dashDir = resolve(root, "dashboards");

function run(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = Bun.spawnSync(["bun", "run", resolve(root, "src/index.ts"), ...args], {
    cwd: root,
    env: { ...process.env },
  });
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

describe("dashcli CLI", () => {
  // Clean up dashboards/ after each test
  afterEach(() => {
    if (existsSync(dashDir)) rmSync(dashDir, { recursive: true });
  });

  describe("create command", () => {
    it("creates a dashboard with default name", () => {
      const { stdout, exitCode } = run(["create"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created dashboard: sample-dashboard");
      expect(existsSync(resolve(dashDir, "sample-dashboard.yaml"))).toBe(true);
      expect(existsSync(resolve(dashDir, "sales.csv"))).toBe(true);
    });

    it("creates a dashboard with custom name", () => {
      const { stdout, exitCode } = run(["create", "my-dash"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Created dashboard: my-dash");
      const spec = readFileSync(resolve(dashDir, "my-dash.yaml"), "utf-8");
      expect(spec).toContain("name: my-dash");
    });

    it("prevents overwriting existing spec", () => {
      run(["create", "existing"]);
      const { stderr, stdout, exitCode } = run(["create", "existing"]);
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Dashboard already exists");
    });

    it("does not re-copy CSV if already exists", () => {
      run(["create", "first"]);
      const csvBefore = readFileSync(resolve(dashDir, "sales.csv"), "utf-8");
      run(["create", "second"]);
      const csvAfter = readFileSync(resolve(dashDir, "sales.csv"), "utf-8");
      expect(csvBefore).toBe(csvAfter);
    });
  });

  describe("serve command", () => {
    it("errors when no spec path given", () => {
      const { stderr, exitCode } = run(["serve"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Provide a path");
    });

    it("errors when spec file not found", () => {
      const { stderr, exitCode } = run(["serve", "nonexistent.yaml"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("File not found");
    });
  });

  describe("export command", () => {
    const outDir = resolve(root, "test-export-out");

    afterEach(() => {
      if (existsSync(outDir)) rmSync(outDir, { recursive: true });
    });

    it("errors when no spec path given", () => {
      const { stderr, exitCode } = run(["export"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Provide a path");
    });

    it("errors when spec file not found", () => {
      const { stderr, exitCode } = run(["export", "nonexistent.yaml"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("File not found");
    });

    it("errors when --out has no value", () => {
      const { stderr, exitCode } = run(["export", "sample/sales-dashboard.yaml", "--out"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("--out requires a directory");
    });

    it("exports a self-contained HTML file", () => {
      const { stdout, exitCode } = run(["export", "sample/sales-dashboard.yaml", "--out", outDir]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Exported:");
      const html = readFileSync(resolve(outDir, "sales-dashboard.html"), "utf-8");
      expect(html).toContain("PRELOADED_DATA");
      expect(html).toContain("PRELOADED_FILTERS");
      expect(html).not.toContain("cdn.jsdelivr.net");
      expect(html).toContain("echarts");
      expect(html).toContain('filter-bar" style="display:none"');
    });

    it("exports to spec directory by default", () => {
      run(["create", "export-test"]);
      const { exitCode } = run(["export", "dashboards/export-test.yaml"]);
      expect(exitCode).toBe(0);
      expect(existsSync(resolve(dashDir, "export-test.html"))).toBe(true);
    });
  });

  describe("general CLI", () => {
    it("shows usage with --help", () => {
      const { stdout, exitCode } = run(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("dashcli");
      expect(stdout).toContain("create");
      expect(stdout).toContain("serve");
    });

    it("shows usage with -h", () => {
      const { stdout, exitCode } = run(["-h"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    });

    it("errors on unknown command", () => {
      const { stderr, exitCode } = run(["foobar"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Unknown command: foobar");
    });
  });
});
