#!/usr/bin/env bun

import { resolve, basename } from "path";
import { startServer, startServerFromSpec } from "./server";
import { exportDashboard } from "./export";
import { suggest, suggestAI, generateSpec, writeChartFiles } from "./suggest";
import { renderChart } from "./render";
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
import {
  readLocalVersion,
  readUpgradeMarker,
  checkForUpdate,
  upgrade,
  getChangelogBetween,
  printUpgradeHint,
  writeSnooze,
  disableUpdateCheck,
  enableUpdateCheck,
  maybeAutoUpgrade,
} from "./upgrade";
import {
  getConfigValue,
  setConfigValue,
  listConfig,
} from "./config";
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
    dashcli render <spec>        Render a single chart as PNG or HTML
    dashcli suggest <source>     Generate a dashboard spec from a data file
    dashcli profile <source>     Profile a data source (JSON output)
    dashcli read <spec>          Read a spec and output a structured summary
    dashcli diff <specA> <specB> Compare two specs and output a changelog
    dashcli version              Show version (add --check to check for updates)
    dashcli upgrade              Upgrade dashcli to the latest version
    dashcli config               List config values
    dashcli config get <key>     Get a config value
    dashcli config set <key> <v> Set a config value (true/false)

  Upgrade options:
    --snooze                     Defer upgrade with escalating backoff
    --auto                       Upgrade now and enable auto-upgrade
    --disable-check              Disable update checks
    --enable-check               Re-enable update checks

  Options:
    --port <n>                   Port for web viewer (default: 3838)
    --out <path>                 Output file for render, directory for export
    --chart <id>                 Chart ID to render from a dashboard spec
    --charts-dir <dir>           Write individual chart specs alongside suggest
    --as <png|html>              Render output format (default: png)
    --width <n>                  Chart width in px (render, default: 800)
    --height <n>                 Chart height in px (render, default: 600)
    --ai                         Use LLM for suggest (requires ANTHROPIC_API_KEY)
    --json                       Output machine-readable JSON envelope

  Examples:
    dashcli data/sales.csv                         # instant dashboard in browser
    dashcli create my-dashboard
    dashcli serve dashboards/my-dashboard.yaml
    dashcli export dashboards/my-dashboard.yaml --out dist/
    dashcli render chart.yaml                      # standalone chart → PNG
    dashcli render chart.yaml --as html             # standalone chart → HTML
    dashcli render spec.yaml --chart revenue       # one chart from dashboard → PNG
    dashcli suggest data/sales.csv
    dashcli suggest data/sales.csv --charts-dir ./charts/
    dashcli suggest data/sales.csv --ai
    dashcli profile data/sales.csv
    dashcli read dashboards/my-dashboard.yaml --json
    dashcli diff dashboards/v1.yaml dashboards/v2.yaml --json
`);
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

// Auto-upgrade from cache (non-blocking, TTY-only, never fetches)
if (command !== "upgrade" && command !== "version" && command !== "config") {
  await maybeAutoUpgrade();
}

try {
  if (command === "config") {
    runConfig(args, flags);
  } else if (command === "create") {
    runCreate(args, flags);
  } else if (command === "serve") {
    runServe(args, flags);
  } else if (command === "export") {
    runExport(args, flags);
  } else if (command === "render") {
    runRender(args, flags);
  } else if (command === "suggest") {
    runSuggest(args, flags);
  } else if (command === "profile") {
    runProfile(args, flags);
  } else if (command === "read") {
    runRead(args, flags);
  } else if (command === "diff") {
    runDiff(args, flags);
  } else if (command === "version") {
    runVersion(args, flags);
  } else if (command === "upgrade") {
    runUpgrade(args, flags);
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
  printUpgradeHint();
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

function runRender(args: string[], flags: GlobalFlags) {
  const specPath = args[1];
  if (!specPath) {
    if (flags.json) outputJson(failure("Provide a path to a chart or dashboard spec.", "RUNTIME_ERROR"), 1);
    console.error("Error: Provide a path to a chart or dashboard spec.");
    console.error("  Usage: dashcli render <spec> [--chart <id>] [--out <file>] [--format png|html]");
    process.exit(1);
  }

  const resolved = resolve(specPath);
  if (!existsSync(resolved)) {
    if (flags.json) outputJson(failure(`File not found: ${specPath}`, "FILE_NOT_FOUND"), 1);
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const chartFlag = args.indexOf("--chart");
  const chartId = chartFlag !== -1 ? args[chartFlag + 1] : undefined;

  const outFlag = args.indexOf("--out");
  const outPath = outFlag !== -1 ? args[outFlag + 1] : undefined;

  const asFlag = args.indexOf("--as");
  const asVal = asFlag !== -1 ? args[asFlag + 1] : undefined;
  const format = (asVal === "html" ? "html" : "png") as "png" | "html";

  const widthFlag = args.indexOf("--width");
  const width = widthFlag !== -1 ? Number(args[widthFlag + 1]) || 800 : 800;

  const heightFlag = args.indexOf("--height");
  const height = heightFlag !== -1 ? Number(args[heightFlag + 1]) || 600 : 600;

  renderChart(resolved, { chartId, outPath, format, width, height })
    .then((result) => {
      if (flags.json) {
        const envelope: Record<string, unknown> = { chartId: result.chartId };
        if (result.path) envelope.path = result.path;
        if (!result.path && format === "html") envelope.html = result.html;
        outputJson(success(envelope));
        return;
      }
      if (!result.path && format === "html") {
        process.stdout.write(result.html);
      } else if (result.path) {
        console.error(`  ✓ Rendered: ${result.path}`);
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
      const chartsDirFlag = args.indexOf("--charts-dir");
      const chartsDir = chartsDirFlag !== -1 ? args[chartsDirFlag + 1] : undefined;

      if (chartsDir) {
        // Validate --charts-dir is a relative path
        if (chartsDir.startsWith("/")) {
          if (flags.json) outputJson(failure("--charts-dir must be a relative path", "RUNTIME_ERROR"), 1);
          console.error("Error: --charts-dir must be a relative path");
          process.exit(1);
        }
        const { files, spec } = writeChartFiles(resolved, chartsDir);
        // Reuse the spec from writeChartFiles to avoid double-profiling
        const yaml = require("yaml");
        const yamlResult = yaml.stringify(spec, { lineWidth: 0 });
        if (flags.json) {
          outputJson(success({ yaml: yamlResult, chartFiles: files }));
        }
        process.stdout.write(yamlResult);
        console.error(`  Generated 1 dashboard spec + ${files.length} chart files in ${chartsDir}/`);
      } else {
        const result = suggest(resolved);
        if (flags.json) {
          outputJson(success({ yaml: result }));
        }
        process.stdout.write(result);
        console.error(`  Generated 1 spec. Try: dashcli suggest ${sourcePath} > spec.yaml && dashcli serve spec.yaml`);
      }
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

function runConfig(args: string[], flags: GlobalFlags) {
  const sub = args[1]; // get, set, or undefined (list)

  if (!sub || sub === "list") {
    const config = listConfig();
    if (flags.json) {
      outputJson(success(config));
      return;
    }
    const entries = Object.entries(config);
    if (entries.length === 0) {
      console.log("  No config values set.");
    } else {
      for (const [key, value] of entries) {
        console.log(`  ${key}: ${value}`);
      }
    }
    return;
  }

  if (sub === "get") {
    const key = args[2];
    if (!key) {
      if (flags.json) outputJson(failure("Provide a config key. Valid keys: auto_upgrade, update_check", "RUNTIME_ERROR"), 1);
      console.error("  Error: Provide a config key. Valid keys: auto_upgrade, update_check");
      process.exit(1);
    }
    if (key !== "auto_upgrade" && key !== "update_check") {
      if (flags.json) outputJson(failure(`Unknown config key: ${key}. Valid keys: auto_upgrade, update_check`, "RUNTIME_ERROR"), 1);
      console.error(`  Error: Unknown config key: ${key}. Valid keys: auto_upgrade, update_check`);
      process.exit(1);
    }
    const value = getConfigValue(key);
    if (flags.json) {
      outputJson(success({ key, value: value ?? null }));
      return;
    }
    console.log(value !== undefined ? `  ${key}: ${value}` : `  ${key}: (not set)`);
    return;
  }

  if (sub === "set") {
    const key = args[2];
    const rawValue = args[3];
    if (!key || rawValue === undefined) {
      if (flags.json) outputJson(failure("Usage: dashcli config set <key> <true|false>", "RUNTIME_ERROR"), 1);
      console.error("  Usage: dashcli config set <key> <true|false>");
      process.exit(1);
    }
    if (key !== "auto_upgrade" && key !== "update_check") {
      if (flags.json) outputJson(failure(`Unknown config key: ${key}. Valid keys: auto_upgrade, update_check`, "RUNTIME_ERROR"), 1);
      console.error(`  Error: Unknown config key: ${key}. Valid keys: auto_upgrade, update_check`);
      process.exit(1);
    }
    if (rawValue !== "true" && rawValue !== "false") {
      if (flags.json) outputJson(failure(`Invalid value: ${rawValue}. Must be true or false.`, "RUNTIME_ERROR"), 1);
      console.error(`  Error: Invalid value: ${rawValue}. Must be true or false.`);
      process.exit(1);
    }
    const value = rawValue === "true";
    setConfigValue(key, value);
    if (flags.json) {
      outputJson(success({ key, value }));
      return;
    }
    console.log(`  ${key}: ${value}`);
    return;
  }

  if (flags.json) outputJson(failure(`Unknown config subcommand: ${sub}. Use get, set, or list.`, "RUNTIME_ERROR"), 1);
  console.error(`  Error: Unknown config subcommand: ${sub}. Use get, set, or list.`);
  process.exit(1);
}

function runVersion(args: string[], flags: GlobalFlags) {
  const version = readLocalVersion();
  const shouldCheck = args.includes("--check");

  // Check for just-upgraded marker
  const upgradedFrom = readUpgradeMarker();
  if (upgradedFrom) {
    if (flags.json) {
      outputJson(success({ version, upgradedFrom }));
    }
    console.log(`  dashcli v${version} (upgraded from v${upgradedFrom})`);
    const changelog = getChangelogBetween(upgradedFrom, version);
    if (changelog) {
      console.log("");
      console.log(changelog);
    }
    return;
  }

  if (!shouldCheck) {
    if (flags.json) {
      outputJson(success({ version }));
    }
    console.log(`  dashcli v${version}`);
    return;
  }

  // --check: also check for updates
  checkForUpdate(true).then((result) => {
    if (flags.json) {
      outputJson(success({
        version,
        latest: result?.latest ?? version,
        updateAvailable: result?.available ?? false,
      }));
      return;
    }
    if (result?.available) {
      console.log(`  dashcli v${version} (update available: v${result.latest})`);
      console.log(`  Run: dashcli upgrade`);
    } else {
      console.log(`  dashcli v${version} (up to date)`);
    }
  }).catch((err) => {
    if (flags.json) {
      outputJson(success({ version, checkFailed: true }));
      return;
    }
    console.log(`  dashcli v${version}`);
    console.error(`  Could not check for updates: ${err instanceof Error ? err.message : String(err)}`);
  });
}

function runUpgrade(_args: string[], flags: GlobalFlags) {
  // Handle action flags (no network check needed)
  if (_args.includes("--disable-check")) {
    disableUpdateCheck();
    if (flags.json) outputJson(success({ update_check: false }));
    console.log("  Update checks disabled. Re-enable with: dashcli upgrade --enable-check");
    return;
  }
  if (_args.includes("--enable-check")) {
    enableUpdateCheck();
    if (flags.json) outputJson(success({ update_check: true }));
    console.log("  Update checks re-enabled.");
    return;
  }

  const current = readLocalVersion();

  if (_args.includes("--snooze")) {
    checkForUpdate(true).then((result) => {
      const version = result?.latest ?? current;
      const { level, durationLabel } = writeSnooze(version);
      if (flags.json) outputJson(success({ snoozed: true, version, level, duration: durationLabel }));
      console.log(`  Snoozed upgrade reminders for ${durationLabel}.`);
      console.log(`  Tip: dashcli config set auto_upgrade true for automatic upgrades.`);
    }).catch(() => {
      // Even if check fails, snooze the current version
      const { level, durationLabel } = writeSnooze(current);
      if (flags.json) outputJson(success({ snoozed: true, version: current, level, duration: durationLabel }));
      console.log(`  Snoozed upgrade reminders for ${durationLabel}.`);
    });
    return;
  }

  log(flags, `\n  dashcli v${current}`);
  log(flags, `  Checking for updates...\n`);

  checkForUpdate(true).then(async (result) => {
    if (!result?.available) {
      if (flags.json) {
        outputJson(success({ version: current, upToDate: true }));
      }
      console.log(`  Already up to date (v${current}).`);
      return;
    }

    log(flags, `  Update available: v${current} → v${result.latest}\n`);

    try {
      const { oldVersion, newVersion } = await upgrade();

      // If --auto flag, enable auto-upgrade after successful upgrade
      if (_args.includes("--auto")) {
        setConfigValue("auto_upgrade", true);
      }

      if (flags.json) {
        outputJson(success({ oldVersion, newVersion, autoUpgrade: _args.includes("--auto") }));
        return;
      }

      console.log(`\n  ✓ Upgraded dashcli: v${oldVersion} → v${newVersion}\n`);

      if (_args.includes("--auto")) {
        console.log("  Auto-upgrade enabled. Future updates will install automatically.\n");
      }

      const changelog = getChangelogBetween(oldVersion, newVersion);
      if (changelog) {
        console.log("  What's new:");
        console.log(changelog);
        console.log("");
      }
    } catch (err) {
      handleError(err);
    }
  }).catch((err) => {
    if (flags.json) {
      const { envelope, exitCode } = errorToEnvelope(err);
      outputJson(envelope, exitCode);
    }
    console.error(`  Upgrade failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
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
