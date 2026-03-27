#!/usr/bin/env bun

/**
 * Generate a JSON Schema file from the Zod DashboardSpec definition.
 * Usage: bun run src/gen-schema.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DashboardSpec } from "./schema";

const outDir = resolve(import.meta.dir, "../schema");
mkdirSync(outDir, { recursive: true });

const jsonSchema = zodToJsonSchema(DashboardSpec, "DashboardSpec");
const outFile = resolve(outDir, "dashboard-spec.schema.json");
writeFileSync(outFile, JSON.stringify(jsonSchema, null, 2) + "\n");

console.log(`  ✓ Generated: ${outFile}`);
