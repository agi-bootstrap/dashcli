#!/usr/bin/env bun

import { resolve } from "path";
import { startServer } from "./server";
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "fs";

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
  dashcli — agent-native BI dashboards

  Usage:
    dashcli create [name]    Create a sample dashboard
    dashcli serve <spec>     Serve a dashboard in the browser

  Options:
    --port <n>               Port for web viewer (default: 3838)

  Examples:
    dashcli create my-dashboard
    dashcli serve dashboards/my-dashboard.yaml
`);
}

if (!command || command === "--help" || command === "-h") {
  usage();
  process.exit(0);
}

if (command === "create") {
  const name = args[1] || "sample-dashboard";
  const dashDir = resolve("dashboards");
  if (!existsSync(dashDir)) mkdirSync(dashDir, { recursive: true });

  // Copy sample files
  const sampleDir = resolve(import.meta.dir, "../sample");
  const specSrc = resolve(sampleDir, "sales-dashboard.yaml");
  const csvSrc = resolve(sampleDir, "sales.csv");

  if (!existsSync(specSrc)) {
    console.error("Error: Sample files not found. Ensure sample/ directory exists.");
    process.exit(1);
  }

  const specDest = resolve(dashDir, `${name}.yaml`);
  const csvDest = resolve(dashDir, "sales.csv");

  if (existsSync(specDest)) {
    console.log(`\n  Dashboard already exists: dashboards/${name}.yaml`);
    console.log(`  Use a different name or delete the existing file.\n`);
    process.exit(1);
  }

  // Copy sample and update the name field
  const specContent = readFileSync(specSrc, "utf-8").replace(/^name:\s*.+$/m, `name: ${name}`);
  writeFileSync(specDest, specContent);
  if (!existsSync(csvDest)) copyFileSync(csvSrc, csvDest);

  console.log(`\n  ✓ Created dashboard: ${name}`);
  console.log(`    Spec: dashboards/${name}.yaml`);
  console.log(`    Data: dashboards/sales.csv`);
  console.log(`\n  Next: dashcli serve dashboards/${name}.yaml\n`);

} else if (command === "serve") {
  const specPath = args[1];
  if (!specPath) {
    console.error("Error: Provide a path to a dashboard YAML spec.");
    console.error("  Usage: dashcli serve <spec.yaml>");
    process.exit(1);
  }

  const resolved = resolve(specPath);
  if (!existsSync(resolved)) {
    console.error(`Error: File not found: ${specPath}`);
    process.exit(1);
  }

  const portFlag = args.indexOf("--port");
  let port = 3838;
  if (portFlag !== -1) {
    const raw = args[portFlag + 1];
    port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`Error: Invalid port "${raw ?? ""}". Must be an integer between 1 and 65535.`);
      process.exit(1);
    }
  }

  startServer(resolved, port);

} else {
  console.error(`Unknown command: ${command}`);
  usage();
  process.exit(1);
}
