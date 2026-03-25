import { describe, it, expect } from "bun:test";
import {
  parseGlobalFlags,
  stripGlobalFlags,
  success,
  failure,
  errorToEnvelope,
} from "../src/cli-utils";

describe("parseGlobalFlags", () => {
  it("defaults to text format with no json flag", () => {
    const flags = parseGlobalFlags(["serve", "spec.yaml"]);
    expect(flags.json).toBe(false);
    expect(flags.format).toBe("text");
  });

  it("sets json and format when --json is passed", () => {
    const flags = parseGlobalFlags(["read", "spec.yaml", "--json"]);
    expect(flags.json).toBe(true);
    expect(flags.format).toBe("json");
  });

  it("--format json implies json flag", () => {
    const flags = parseGlobalFlags(["read", "spec.yaml", "--format", "json"]);
    expect(flags.json).toBe(true);
    expect(flags.format).toBe("json");
  });

  it("--json overrides --format text", () => {
    const flags = parseGlobalFlags(["read", "--format", "text", "--json"]);
    expect(flags.json).toBe(true);
    expect(flags.format).toBe("json");
  });
});

describe("stripGlobalFlags", () => {
  it("removes --json from args", () => {
    const args = stripGlobalFlags(["read", "spec.yaml", "--json"]);
    expect(args).toEqual(["read", "spec.yaml"]);
  });

  it("removes --format and its value", () => {
    const args = stripGlobalFlags(["read", "spec.yaml", "--format", "json"]);
    expect(args).toEqual(["read", "spec.yaml"]);
  });

  it("removes both --json and --format", () => {
    const args = stripGlobalFlags(["diff", "a.yaml", "b.yaml", "--json", "--format", "json"]);
    expect(args).toEqual(["diff", "a.yaml", "b.yaml"]);
  });

  it("preserves non-flag args", () => {
    const args = stripGlobalFlags(["serve", "spec.yaml", "--port", "4000"]);
    expect(args).toEqual(["serve", "spec.yaml", "--port", "4000"]);
  });
});

describe("success", () => {
  it("wraps data in an envelope", () => {
    const env = success({ name: "test" });
    expect(env.ok).toBe(true);
    expect(env.data).toEqual({ name: "test" });
    expect(env.error).toBeNull();
  });
});

describe("failure", () => {
  it("wraps error in an envelope", () => {
    const env = failure("Not found", "FILE_NOT_FOUND");
    expect(env.ok).toBe(false);
    expect(env.data).toBeNull();
    expect(env.error?.message).toBe("Not found");
    expect(env.error?.code).toBe("FILE_NOT_FOUND");
  });

  it("includes optional context", () => {
    const env = failure("Bad spec", "SPEC_VALIDATION", [{ path: "charts.0" }]);
    expect(env.error?.context).toEqual([{ path: "charts.0" }]);
  });
});

describe("errorToEnvelope", () => {
  it("maps ZodError to SPEC_VALIDATION", () => {
    const err = new Error("Validation failed");
    (err as any).name = "ZodError";
    (err as any).issues = [{ path: ["charts", 0] }];
    const { envelope, exitCode } = errorToEnvelope(err);
    expect(envelope.error?.code).toBe("SPEC_VALIDATION");
    expect(exitCode).toBe(1);
  });

  it("maps ENOENT to FILE_NOT_FOUND", () => {
    const err: any = new Error("no such file");
    err.code = "ENOENT";
    err.path = "/missing.yaml";
    const { envelope, exitCode } = errorToEnvelope(err);
    expect(envelope.error?.code).toBe("FILE_NOT_FOUND");
    expect(exitCode).toBe(1);
  });

  it("maps YAML parse error", () => {
    const err = new Error("YAML parse error at line 5");
    const { envelope } = errorToEnvelope(err);
    expect(envelope.error?.code).toBe("YAML_PARSE_ERROR");
  });

  it("maps data source errors to exit code 2", () => {
    const err = new Error("Unsupported data source extension");
    const { envelope, exitCode } = errorToEnvelope(err);
    expect(envelope.error?.code).toBe("DATA_SOURCE_ERROR");
    expect(exitCode).toBe(2);
  });

  it("falls back to RUNTIME_ERROR for unknown errors", () => {
    const err = new Error("something broke");
    const { envelope, exitCode } = errorToEnvelope(err);
    expect(envelope.error?.code).toBe("RUNTIME_ERROR");
    expect(exitCode).toBe(3);
  });

  it("handles non-Error thrown values", () => {
    const { envelope } = errorToEnvelope("string error");
    expect(envelope.error?.code).toBe("RUNTIME_ERROR");
    expect(envelope.error?.message).toBe("string error");
  });
});
