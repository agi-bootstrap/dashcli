import { describe, it, expect, afterEach } from "bun:test";
import { existsSync, rmSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dir, "..");
const dashDir = resolve(root, "dashboards");
const sampleSpec = "sample/sales-dashboard.yaml";

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

function parseJson(stdout: string) {
  return JSON.parse(stdout.trim());
}

describe("--json flag", () => {
  afterEach(() => {
    if (existsSync(dashDir)) rmSync(dashDir, { recursive: true });
  });

  describe("create --json", () => {
    it("outputs JSON envelope on success", () => {
      const { stdout, exitCode } = run(["create", "json-test", "--json"]);
      expect(exitCode).toBe(0);
      const env = parseJson(stdout);
      expect(env.ok).toBe(true);
      expect(env.data.name).toBe("json-test");
      expect(env.data.spec).toBe("dashboards/json-test.yaml");
    });

    it("outputs JSON envelope on duplicate error", () => {
      run(["create", "dup-test", "--json"]);
      const { stdout, exitCode } = run(["create", "dup-test", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
      expect(env.error.code).toBe("RUNTIME_ERROR");
    });
  });

  describe("read --json", () => {
    it("outputs structured summary as JSON", () => {
      const { stdout, exitCode } = run(["read", sampleSpec, "--json"]);
      expect(exitCode).toBe(0);
      const env = parseJson(stdout);
      expect(env.ok).toBe(true);
      expect(env.data.name).toBe("sales-dashboard");
      expect(env.data.chartCount).toBe(6);
      expect(env.data.charts).toHaveLength(6);
      expect(env.data.filters).toHaveLength(2);
    });

    it("outputs error envelope for missing file", () => {
      const { stdout, exitCode } = run(["read", "nonexistent.yaml", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
      expect(env.error.code).toBe("FILE_NOT_FOUND");
    });
  });

  describe("read --format json", () => {
    it("works the same as --json for read", () => {
      const { stdout, exitCode } = run(["read", sampleSpec, "--format", "json"]);
      expect(exitCode).toBe(0);
      const env = parseJson(stdout);
      expect(env.ok).toBe(true);
      expect(env.data.name).toBe("sales-dashboard");
    });
  });

  describe("diff --json", () => {
    it("outputs diff result as JSON", () => {
      const { stdout, exitCode } = run(["diff", sampleSpec, sampleSpec, "--json"]);
      expect(exitCode).toBe(0);
      const env = parseJson(stdout);
      expect(env.ok).toBe(true);
      expect(env.data.hasChanges).toBe(false);
      expect(env.data.charts).toEqual([]);
    });

    it("outputs error for missing first file", () => {
      const { stdout, exitCode } = run(["diff", "missing.yaml", sampleSpec, "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
      expect(env.error.code).toBe("FILE_NOT_FOUND");
    });

    it("outputs error when no paths given", () => {
      const { stdout, exitCode } = run(["diff", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
    });
  });

  describe("unknown command --json", () => {
    it("outputs JSON error for unknown command", () => {
      const { stdout, exitCode } = run(["foobar", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
      expect(env.error.code).toBe("UNKNOWN_COMMAND");
    });
  });

  describe("serve --json errors", () => {
    it("outputs JSON for missing spec", () => {
      const { stdout, exitCode } = run(["serve", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
    });

    it("outputs JSON for file not found", () => {
      const { stdout, exitCode } = run(["serve", "missing.yaml", "--json"]);
      expect(exitCode).toBe(1);
      const env = parseJson(stdout);
      expect(env.ok).toBe(false);
      expect(env.error.code).toBe("FILE_NOT_FOUND");
    });
  });
});
