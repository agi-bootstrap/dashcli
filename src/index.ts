#!/usr/bin/env bun

import { resolve } from "path";
import { startServer } from "./server";
import { exportDashboard } from "./export";
import { suggestDashboards } from "./suggest";
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
    dashcli create [name]        Create a sample dashboard
    dashcli serve <spec>         Serve a dashboard in the browser
    dashcli export <spec>        Export a self-contained HTML file
    dashcli suggest <source>     Generate dashboard specs from a data file
    dashcli read <spec>          Read a spec and output a structured summary
    dashcli diff <specA> <specB> Compare two specs and output a changelog

  Options:
    --port <n>                   Port for web viewer (default: 3838)
    --out <dir>                  Output directory for export/suggest (default: source dir)
    --json                       Output machine-readable JSON envelope
    --format <text|json>         Output format (default: text, --json implies json)

  Examples:
    dashcli create my-dashboard
    dashcli serve dashboards/my-dashboard.yaml
    dashcli export dashboards/my-dashboard.yaml --out dist/
    dashcli suggest data/sales.csv --out dashboards/
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
  } else if (command === "read") {
    runRead(args, flags);
  } else if (command === "diff") {
    runDiff(args, flags);
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
    console.error("  Usage: dashcli suggest <source> [--out dir]");
    process.exit(1);
  }

  const resolved = resolve(sourcePath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${sourcePath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${sourcePath}`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    if (flags.json) outputJson(failure("ANTHROPIC_API_KEY environment variable is required.", "RUNTIME_ERROR"), 1);
    console.error("Error: ANTHROPIC_API_KEY environment variable is required.");
    console.error("  Set it with: export ANTHROPIC_API_KEY=sk-ant-...");
    process.exit(1);
  }

  const outFlag = args.indexOf("--out");
  if (outFlag !== -1 && !args[outFlag + 1]) {
    if (flags.json) outputJson(failure("--out requires a directory argument.", "RUNTIME_ERROR"), 1);
    console.error("Error: --out requires a directory argument.");
    process.exit(1);
  }
  const outDir = outFlag !== -1 ? resolve(args[outFlag + 1]) : undefined;

  log(flags, `\n  Analyzing ${sourcePath}...`);
  suggestDashboards(resolved, { outDir })
    .then((files) => {
      if (files.length === 0) {
        if (flags.json) outputJson(failure("No valid dashboard specs were generated.", "RUNTIME_ERROR"), 1);
        console.error("\n  No valid dashboard specs were generated.");
        process.exit(1);
      }
      if (flags.json) {
        outputJson(success({ files }));
      }
      console.log(`\n  Generated ${files.length} dashboard spec(s).`);
      console.log(`  Try: dashcli serve ${files[0]}\n`);
    })
    .catch((err) => {
      handleError(err);
    });
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
