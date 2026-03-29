/**
 * dashcli config system — YAML config at ~/.dashcli/.config.yaml.
 *
 * Replaces the old .update-check-disabled flag file with a structured config.
 * Supports get/set/list with atomic writes and corrupt-file recovery.
 */

import { resolve } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  mkdirSync,
} from "fs";
import { parse, stringify } from "yaml";

// ── Constants ────────────────────────────────────────────────────────

const STATE_DIR = resolve(process.env.HOME || "~", ".dashcli");
const CONFIG_FILE = resolve(STATE_DIR, ".config.yaml");
const DISABLED_FILE = resolve(STATE_DIR, ".update-check-disabled");

/** Valid config keys and their types. */
export type ConfigKey = "auto_upgrade" | "update_check";

export interface DashcliConfig {
  auto_upgrade?: boolean;
  update_check?: boolean;
}

// ── Read / Write ─────────────────────────────────────────────────────

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

/** Read the config file. Returns {} on missing or corrupt file. */
export function readConfig(): DashcliConfig {
  migrateFromFlagFile();

  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as DashcliConfig;
  } catch {
    console.error("  Warning: ~/.dashcli/.config.yaml is corrupt, using defaults.");
    return {};
  }
}

/** Write config atomically (write to tmp, then rename). */
export function writeConfig(config: DashcliConfig): void {
  ensureStateDir();
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, stringify(config), "utf-8");
  renameSync(tmp, CONFIG_FILE);
}

// ── Get / Set ────────────────────────────────────────────────────────

/** Get a config value. Returns undefined if not set. Strict boolean check. */
export function getConfigValue(key: ConfigKey): boolean | undefined {
  const config = readConfig();
  const value = config[key];
  if (value === true || value === false) return value;
  return undefined;
}

/** Set a config value. Merges into existing config. */
export function setConfigValue(key: ConfigKey, value: boolean): void {
  const config = readConfig();
  config[key] = value;
  writeConfig(config);
}

/** List all config values. */
export function listConfig(): DashcliConfig {
  return readConfig();
}

// ── Migration ────────────────────────────────────────────────────────

/**
 * Migrate from the old .update-check-disabled flag file to config.
 * Write config first, delete flag file second (safe order).
 * Only runs once — skips if config already has update_check key.
 */
function migrateFromFlagFile(): void {
  if (!existsSync(DISABLED_FILE)) return;

  // Check if config already has update_check set (avoid double migration)
  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = parse(raw);
      if (parsed && typeof parsed === "object" && "update_check" in parsed) {
        // Already migrated, just clean up the old file
        try { unlinkSync(DISABLED_FILE); } catch {}
        return;
      }
    } catch {
      // Corrupt config — proceed with migration (will overwrite)
    }
  }

  // Migrate: flag file exists → update_check: false
  ensureStateDir();
  const config = existsSync(CONFIG_FILE) ? readConfigDirect() : {};
  config.update_check = false;
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, stringify(config), "utf-8");
  renameSync(tmp, CONFIG_FILE);

  // Delete the old flag file
  try { unlinkSync(DISABLED_FILE); } catch {}
}

/** Read config without triggering migration (avoids recursion). */
function readConfigDirect(): DashcliConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    return parsed as DashcliConfig;
  } catch {
    return {};
  }
}
