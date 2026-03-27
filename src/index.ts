#!/usr/bin/env bun

import { resolve, basename } from "path";
import { startServer, startServerFromSpec } from "./server";
import { exportDashboard } from "./export";
import { suggest, suggestAI, generateSpec } from "./suggest";
import { profileDataSource } from "./profiler";
import { readSpec, formatReadText } from "./read";
import { diffSpecs, formatDiffText } from "./diff";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import {
  parseGlobalFlags,
  stripGlobalFlags,
  success,
  failure,
  errorToEnvelope,
  log,
  type GlobalFlags,
} from "./cli-utils";
import { spawn } from "child_process";

const rawArgs = process.argv.slice(2);
const flags = parseGlobalFlags(rawArgs);
const args = stripGlobalFlags(rawArgs);
const command = args[0];

/** Output JSON envelope to stdout and exit. */
function outputJson(envelope: object, exitCode: number = 0): never {
  process.stdout.write(JSON.stringify(envelope) + "\n");
  process.exit(exitCode);
}

/** Handle errors with JSON envelope support. */
function handleError(err: unknown): never {
  if (flags.json) {
    const { envelope, exitCode } = errorToEnvelope(err);
    outputJson(envelope, exitCode);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

function usage() {
  console.log(`
  dashcli — agent-native BI dashboards

  Usage:
    dashcli <data>               One command to dashboard (suggest + serve + open)
    dashcli create [name]        Create a sample dashboard
    dashcli serve <spec>         Serve a dashboard in the browser
    dashcli export <spec>        Export a self-contained HTML file
    dashcli suggest <source>     Generate a dashboard spec from a data file
    dashcli profile <source>     Profile a data source (JSON output)
    dashcli read <spec>          Read a spec and output a structured summary
    dashcli diff <specA> <specB> Compare two specs and output a changelog

  Options:
    --port <n>                   Port for web viewer (default: 3838)
    --out <dir>                  Output directory for export (default: source dir)
    --ai                         Use LLM for suggest (requires ANTHROPIC_API_KEY)
    --json                       Output machine-readable JSON envelope
    --format <text|json>         Output format (default: text, --json implies json)

  Examples:
    dashcli data/sales.csv                         # instant dashboard in browser
    dashcli create my-dashboard
    dashcli serve dashboards/my-dashboard.yaml
    dashcli export dashboards/my-dashboard.yaml --out dist/
    dashcli suggest data/sales.csv
    dashcli suggest data/sales.csv --ai
    dashcli profile data/sales.csv
    dashcli read dashboards/my-dashboard.yaml
    dashcli read dashboards/my-dashboard.yaml --json
    dashcli diff dashboards/v1.yaml dashboards/v2.yaml --json
`);
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

try {
  if (command === "create") {
    runCreate(args, flags);
  } else if (command === "serve") {
    runServe(args, flags);
  } else if (command === "export") {
    runExport(args, flags);
  } else if (command === "suggest") {
    runSuggest(args, flags);
  } else if (command === "profile") {
    runProfile(args, flags);
  } else if (command === "read") {
    runRead(args, flags);
  } else if (command === "diff") {
    runDiff(args, flags);
  } else if (command === "dashboard" || /\.(csv|json)$/i.test(command)) {
    runDashboard(args, flags);
  } else {
    if (flags.json) {
      outputJson(failure(`Unknown command: ${command}`, "UNKNOWN_COMMAND"), 1);
    }
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }
} catch (err) {
  handleError(err);
}

// ── Command Handlers ──────────────────────────────────────────────

function runCreate(args: string[], flags: GlobalFlags) {
  const name = args[1] || "sample-dashboard";
  const dashDir = resolve("dashboards");
  if (!existsSync(dashDir)) mkdirSync(dashDir, { recursive: true });

  const sampleDir = resolve(import.meta.dir, "../sample");
  const specSrc = resolve(sampleDir, "sales-dashboard.yaml");
  const csvSrc = resolve(sampleDir, "sales.csv");

  if (!existsSync(specSrc)) {
    if (flags.json) outputJson(failure("Sample files not found. Ensure sample/ directory exists.", "RUNTIME_ERROR"), 3);
    console.error("Error: Sample files not found. Ensure sample/ directory exists.");
    process.exit(1);
  }

  const specDest = resolve(dashDir, `${name}.yaml`);
  const csvDest = resolve(dashDir, "sales.csv");

  if (existsSync(specDest)) {
    if (flags.json) outputJson(failure(`Dashboard already exists: dashboards/${name}.yaml`, "RUNTIME_ERROR"), 1);
    console.log(`\n  Dashboard already exists: dashboards/${name}.yaml`);
    console.log(`  Use a different name or delete the existing file.\n`);
    process.exit(1);
  }

  const specContent = readFileSync(specSrc, "utf-8").replace(/^name:\s*.+$/m, `name: ${name}`);
  writeFileSync(specDest, specContent);
  if (!existsSync(csvDest)) copyFileSync(csvSrc, csvDest);

  if (flags.json) {
    outputJson(success({ name, spec: `dashboards/${name}.yaml`, data: "dashboards/sales.csv" }));
  }

  console.log(`\n  ✓ Created dashboard: ${name}`);
  console.log(`    Spec: dashboards/${name}.yaml`);
  console.log(`    Data: dashboards/sales.csv`);
  console.log(`\n  Next: dashcli serve dashboards/${name}.yaml\n`);
}

function runServe(args: string[], flags: GlobalFlags) {
  const specPath = args[1];
  if (!specPath) {
    if (flags.json) outputJson(failure("Provide a path to a dashboard YAML spec.", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a dashboard YAML spec.");
    console.error("  Usage: dashcli serve <spec.yaml>");
    process.exit(1);
  }

  const resolved = resolve(specPath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${specPath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const portFlag = args.indexOf("--port");
  let port = 3838;
  if (portFlag !== -1) {
    const raw = args[portFlag + 1];
    port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      if (flags.json) outputJson(failure(`Invalid port "${raw ?? ""}". Must be an integer between 1 and 65535.`, "RUNTIME_ERROR"), 1);
      console.error(`Error: Invalid port "${raw ?? ""}". Must be an integer between 1 and 65535.`);
      process.exit(1);
    }
  }

  startServer(resolved, port);
}

function runExport(args: string[], flags: GlobalFlags) {
  const specPath = args[1];
  if (!specPath) {
    if (flags.json) outputJson(failure("Provide a path to a dashboard YAML spec.", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a dashboard YAML spec.");
    console.error("  Usage: dashcli export <spec.yaml> [--out dir]");
    process.exit(1);
  }

  const resolved = resolve(specPath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${specPath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const outFlag = args.indexOf("--out");
  if (outFlag !== -1 && !args[outFlag + 1]) {
    if (flags.json) outputJson(failure("--out requires a directory argument.", "RUNTIME_ERROR"), 1);
    console.error("Error: --out requires a directory argument.");
    process.exit(1);
  }
  const outDir = outFlag !== -1 ? resolve(args[outFlag + 1]) : undefined;

  exportDashboard(resolved, outDir)
    .then((outFile) => {
      if (flags.json && outFile) {
        outputJson(success({ path: outFile }));
      }
    })
    .catch((err) => {
      handleError(err);
    });
}

function runSuggest(args: string[], flags: GlobalFlags) {
  const sourcePath = args[1];
  if (!sourcePath) {
    if (flags.json) outputJson(failure("Provide a path to a data file (CSV or JSON).", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a data file (CSV or JSON).");
    console.error("  Usage: dashcli suggest <source> [--ai]");
    process.exit(1);
  }

  const resolved = resolve(sourcePath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${sourcePath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${sourcePath}`);
    process.exit(1);
  }

  const useAI = args.includes("--ai");

  if (useAI) {
    if (!process.env.ANTHROPIC_API_KEY) {
      if (flags.json) outputJson(failure("ANTHROPIC_API_KEY environment variable is required for --ai mode.", "RUNTIME_ERROR"), 1);
      console.error("Error: ANTHROPIC_API_KEY environment variable is required for --ai mode.");
      console.error("  Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
      console.error("  Or omit --ai for the heuristic mode (no API key needed).");
      process.exit(1);
    }

    console.error(`  Analyzing ${sourcePath} with LLM...`);
    suggestAI(resolved)
      .then((result) => {
        if (flags.json) {
          const specCount = result.split("\n---\n").length;
          outputJson(success({ yaml: result, specCount }));
        }
        process.stdout.write(result);
        const specCount = result.split("\n---\n").length;
        console.error(`  Generated ${specCount} spec(s). Pipe to a file: dashcli suggest ${sourcePath} --ai > spec.yaml`);
      })
      .catch((err: Error) => {
        handleError(err);
      });
  } else {
    try {
      const result = suggest(resolved);
      if (flags.json) {
        outputJson(success({ yaml: result }));
      }
      process.stdout.write(result);
      console.error(`  Generated 1 spec. Try: dashcli suggest ${sourcePath} > spec.yaml && dashcli serve spec.yaml`);
    } catch (err: unknown) {
      handleError(err);
    }
  }
}

function runProfile(args: string[], flags: GlobalFlags) {
  const sourcePath = args[1];
  if (!sourcePath) {
    if (flags.json) outputJson(failure("Provide a path to a data file (CSV or JSON).", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a data file (CSV or JSON).");
    console.error("  Usage: dashcli profile <source>");
    process.exit(1);
  }

  const resolved = resolve(sourcePath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${sourcePath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${sourcePath}`);
    process.exit(1);
  }

  try {
    const profile = profileDataSource(resolved);
    if (flags.json) {
      outputJson(success(profile));
    }
    process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
  } catch (err: unknown) {
    handleError(err);
  }
}

function runRead(args: string[], flags: GlobalFlags) {
  const specPath = args[1];
  if (!specPath) {
    if (flags.json) outputJson(failure("Provide a path to a dashboard YAML spec.", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a dashboard YAML spec.");
    console.error("  Usage: dashcli read <spec.yaml>");
    process.exit(1);
  }

  const resolved = resolve(specPath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${specPath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const summary = readSpec(resolved);

  if (flags.format === "json") {
    outputJson(success(summary));
  }

  console.log("");
  console.log(formatReadText(summary));
  console.log("");
}

function runDiff(args: string[], flags: GlobalFlags) {
  const specPathA = args[1];
  const specPathB = args[2];

  if (!specPathA || !specPathB) {
    if (flags.json) outputJson(failure("Provide two spec paths to compare.", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide two spec paths to compare.");
    console.error("  Usage: dashcli diff <specA.yaml> <specB.yaml>");
    process.exit(1);
  }

  const resolvedA = resolve(specPathA);
  const resolvedB = resolve(specPathB);

  if (!existsSync(resolvedA)) {
    if (flags.json) outputJson(failure(`File not found: ${specPathA}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPathA}`);
    process.exit(1);
  }
  if (!existsSync(resolvedB)) {
    if (flags.json) outputJson(failure(`File not found: ${specPathB}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPathB}`);
    process.exit(1);
  }

  const diff = diffSpecs(resolvedA, resolvedB);

  if (flags.format === "json") {
    outputJson(success(diff));
  }

  console.log("");
  console.log(formatDiffText(diff));
  console.log("");
}

function runDashboard(args: string[], flags: GlobalFlags) {
  const sourcePath = command === "dashboard" ? args[1] : command;
  if (!sourcePath) {
    if (flags.json) outputJson(failure("Provide a path to a data file (CSV or JSON).", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a data file (CSV or JSON).");
    console.error("  Usage: dashcli <data.csv>");
    process.exit(1);
  }

  const resolved = resolve(sourcePath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${sourcePath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${sourcePath}`);
    process.exit(1);
  }

  const ext = resolved.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  if (ext !== ".csv" && ext !== ".json") {
    if (flags.json) outputJson(failure(`Unsupported file type "${ext}". Use .csv or .json.`, "RUNTIME_ERROR"), 1);
    console.error(`Error: Unsupported file type "${ext}". Use .csv or .json.`);
    process.exit(1);
  }

  const portFlag = args.indexOf("--port");
  let port = 3838;
  if (portFlag !== -1) {
    const raw = args[portFlag + 1];
    port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      if (flags.json) outputJson(failure(`Invalid port "${raw ?? ""}". Must be an integer between 1 and 65535.`, "RUNTIME_ERROR"), 1);
      console.error(`Error: Invalid port "${raw ?? ""}". Must be an integer between 1 and 65535.`);
      process.exit(1);
    }
  }

  // Kill any previous dashcli server on this port
  try {
    const check = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`]);
    const pids = check.stdout.toString().trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        const n = Number(pid);
        if (n && n !== process.pid) {
          try { process.kill(n, "SIGTERM"); } catch {}
        }
      }
      Bun.sleepSync(200);
    }
  } catch {
    // lsof not available or no process found
  }

  const profile = profileDataSource(resolved);
  const spec = generateSpec(profile, basename(resolved));
  const server = startServerFromSpec(spec, resolved, port);
  const url = `http://localhost:${server.port}/d/${spec.name}`;

  if (flags.json) {
    outputJson(success({ url, name: spec.name, charts: spec.charts.length, filters: spec.filters.length }));
  }

  // Open browser
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
  } else if (platform === "linux") {
    spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
  } else if (platform === "win32") {
    spawn("cmd", ["/c", "start", url], { stdio: "ignore", detached: true }).unref();
  }

  // Cleanup on exit
  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}
