/**
 * Shared CLI utilities: JSON envelope, global flags, error handling.
 */

export interface JsonEnvelope<T = unknown> {
  ok: boolean;
  data: T | null;
  error: { message: string; code: string; context?: unknown } | null;
}

export interface GlobalFlags {
  json: boolean;
  format: "json" | "text";
}

/** Parse global flags (--json, --format) from argv. */
export function parseGlobalFlags(args: string[]): GlobalFlags {
  const json = args.includes("--json");
  const formatIdx = args.indexOf("--format");
  let format: "json" | "text" = json ? "json" : "text";
  if (formatIdx !== -1 && args[formatIdx + 1]) {
    const val = args[formatIdx + 1];
    if (val === "json" || val === "text") format = val;
  }
  if (json) format = "json"; // --json always wins
  return { json: json || format === "json", format };
}

/** Remove global flags from args so command handlers don't see them. */
export function stripGlobalFlags(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") continue;
    if (args[i] === "--format" && args[i + 1]) { i++; continue; }
    result.push(args[i]);
  }
  return result;
}

/** Wrap a successful result in a JSON envelope. */
export function success<T>(data: T): JsonEnvelope<T> {
  return { ok: true, data, error: null };
}

/** Wrap an error in a JSON envelope. */
export function failure(message: string, code: string, context?: unknown): JsonEnvelope<never> {
  return { ok: false, data: null, error: { message, code, ...(context !== undefined ? { context } : {}) } };
}

/** Map an error to a structured code and envelope. */
export function errorToEnvelope(err: unknown): { envelope: JsonEnvelope<never>; exitCode: number } {
  if (err instanceof Error) {
    const msg = err.message;

    // Zod validation errors
    if (err.name === "ZodError" && "issues" in err) {
      return {
        envelope: failure(msg, "SPEC_VALIDATION", (err as any).issues),
        exitCode: 1,
      };
    }

    // File not found
    if ((err as any).code === "ENOENT") {
      return {
        envelope: failure(`File not found: ${(err as any).path || msg}`, "FILE_NOT_FOUND"),
        exitCode: 1,
      };
    }

    // YAML parse errors
    if (err.name === "YAMLParseError" || msg.includes("YAML")) {
      return {
        envelope: failure(msg, "YAML_PARSE_ERROR"),
        exitCode: 1,
      };
    }

    // Data source errors
    if (msg.includes("Unsupported data source") || msg.includes("CSV file") || msg.includes("JSON file")) {
      return {
        envelope: failure(msg, "DATA_SOURCE_ERROR"),
        exitCode: 2,
      };
    }

    // Generic runtime error
    return {
      envelope: failure(msg, "RUNTIME_ERROR"),
      exitCode: 3,
    };
  }

  return {
    envelope: failure(String(err), "RUNTIME_ERROR"),
    exitCode: 3,
  };
}

/** Write output respecting --json flag. In JSON mode, progress goes to stderr. */
export function log(flags: GlobalFlags, ...args: unknown[]) {
  if (flags.json) {
    process.stderr.write(args.map(String).join(" ") + "\n");
  } else {
    console.log(...args);
  }
}
