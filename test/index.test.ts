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

  describe("--port validation", () => {
    it("rejects non-numeric port", () => {
      const { stderr, exitCode } = run(["serve", "sample/sales-dashboard.yaml", "--port", "abc"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid port");
    });

    it("rejects port 0", () => {
      const { stderr, exitCode } = run(["serve", "sample/sales-dashboard.yaml", "--port", "0"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid port");
    });

    it("rejects port above 65535", () => {
      const { stderr, exitCode } = run(["serve", "sample/sales-dashboard.yaml", "--port", "70000"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid port");
    });

    it("rejects missing port value", () => {
      const { stderr, exitCode } = run(["serve", "sample/sales-dashboard.yaml", "--port"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid port");
    });

    it("rejects fractional port", () => {
      const { stderr, exitCode } = run(["serve", "sample/sales-dashboard.yaml", "--port", "3838.5"]);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("Invalid port");
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
