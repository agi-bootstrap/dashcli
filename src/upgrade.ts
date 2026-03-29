/**
 * dashcli upgrade mechanism — gstack-style version check + self-update.
 *
 * Two install modes:
 *   git:      ~/.dashcli with .git/  → git pull origin main && ./setup
 *   vendored: .dashcli/ without .git → clone to tmp, swap dirs, rm .git, ./setup
 *
 * State stored in ~/.dashcli/ alongside install (dot-prefixed files, gitignored).
 */

import { resolve, dirname } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync, renameSync, rmSync } from "fs";

// ── Constants ────────────────────────────────────────────────────────

const REMOTE_VERSION_URL = "https://raw.githubusercontent.com/agi-bootstrap/dashcli/main/VERSION";
const STATE_DIR = resolve(process.env.HOME || "~", ".dashcli");
const CACHE_FILE = resolve(STATE_DIR, ".last-update-check");
const SNOOZE_FILE = resolve(STATE_DIR, ".update-snoozed");
const DISABLED_FILE = resolve(STATE_DIR, ".update-check-disabled");
const MARKER_FILE = resolve(STATE_DIR, ".just-upgraded-from");

/** Cache TTL in minutes. */
const TTL_UP_TO_DATE = 60;       // re-check hourly when up to date
const TTL_UPGRADE_AVAILABLE = 720; // re-nag every 12 hours when upgrade exists

/** Snooze durations in seconds. */
const SNOOZE_DURATIONS: Record<number, number> = {
  1: 86400,   // 24 hours
  2: 172800,  // 48 hours
  3: 604800,  // 7 days (level 3+)
};

const VERSION_REGEX = /^\d+(\.\d+)+$/;

// ── Types ────────────────────────────────────────────────────────────

export interface UpdateResult {
  current: string;
  latest: string;
  available: boolean;
}

export interface InstallInfo {
  type: "git" | "vendored";
  dir: string;
}

interface CacheEntry {
  status: "UP_TO_DATE" | "UPGRADE_AVAILABLE";
  versions: string[];  // [current] or [current, latest]
  stale: boolean;
}

interface SnoozeEntry {
  version: string;
  level: number;
  epoch: number;
}

// ── Install detection ────────────────────────────────────────────────

/** Get the dashcli install root (parent of src/). */
export function getInstallDir(): string {
  return resolve(import.meta.dir, "..");
}

/** Detect whether this is a git clone or vendored install. */
export function detectInstallType(): InstallInfo {
  const dir = getInstallDir();
  const isGit = existsSync(resolve(dir, ".git"));
  return { type: isGit ? "git" : "vendored", dir };
}

// ── Version reading ──────────────────────────────────────────────────

/** Read the local VERSION file. */
export function readLocalVersion(): string {
  const versionFile = resolve(getInstallDir(), "VERSION");
  if (!existsSync(versionFile)) return "unknown";
  return readFileSync(versionFile, "utf-8").trim();
}

/** Read the just-upgraded-from marker (if any). Deletes the marker. */
export function readUpgradeMarker(): string | null {
  if (!existsSync(MARKER_FILE)) return null;
  const old = readFileSync(MARKER_FILE, "utf-8").trim();
  unlinkSync(MARKER_FILE);
  return old || null;
}

// ── State directory ──────────────────────────────────────────────────

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

// ── Cache ────────────────────────────────────────────────────────────

/** Read the update check cache. Returns null if no cache or corrupt. */
export function readCache(): CacheEntry | null {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    const content = readFileSync(CACHE_FILE, "utf-8").trim();
    const parts = content.split(" ");
    const status = parts[0] as CacheEntry["status"];
    if (status !== "UP_TO_DATE" && status !== "UPGRADE_AVAILABLE") return null;

    const mtime = statSync(CACHE_FILE).mtimeMs;
    const ageMin = (Date.now() - mtime) / 60000;
    const ttl = status === "UP_TO_DATE" ? TTL_UP_TO_DATE : TTL_UPGRADE_AVAILABLE;
    const stale = ageMin > ttl;

    return { status, versions: parts.slice(1), stale };
  } catch {
    return null;
  }
}

function writeCache(content: string): void {
  ensureStateDir();
  writeFileSync(CACHE_FILE, content, "utf-8");
}

// ── Snooze ───────────────────────────────────────────────────────────

/** Check if the user has snoozed this version. */
export function isSnoozed(remoteVersion: string): boolean {
  if (!existsSync(SNOOZE_FILE)) return false;
  try {
    const entry = readSnoozeEntry();
    if (!entry) return false;

    // New version resets snooze
    if (entry.version !== remoteVersion) return false;

    const duration = SNOOZE_DURATIONS[Math.min(entry.level, 3)] ?? SNOOZE_DURATIONS[3];
    const expires = entry.epoch + duration;
    return Date.now() / 1000 < expires;
  } catch {
    return false;
  }
}

function readSnoozeEntry(): SnoozeEntry | null {
  if (!existsSync(SNOOZE_FILE)) return null;
  const parts = readFileSync(SNOOZE_FILE, "utf-8").trim().split(" ");
  if (parts.length < 3) return null;
  const level = parseInt(parts[1], 10);
  const epoch = parseInt(parts[2], 10);
  if (isNaN(level) || isNaN(epoch)) return null;
  return { version: parts[0], level, epoch };
}

/** Write snooze state with escalating backoff. */
export function writeSnooze(remoteVersion: string): { level: number; durationLabel: string } {
  ensureStateDir();
  const existing = readSnoozeEntry();
  let level = 1;
  if (existing && existing.version === remoteVersion) {
    level = Math.min(existing.level + 1, 3);
  }
  const epoch = Math.floor(Date.now() / 1000);
  writeFileSync(SNOOZE_FILE, `${remoteVersion} ${level} ${epoch}`, "utf-8");

  const labels: Record<number, string> = { 1: "24 hours", 2: "48 hours", 3: "1 week" };
  return { level, durationLabel: labels[level] ?? "1 week" };
}

function clearSnooze(): void {
  try { unlinkSync(SNOOZE_FILE); } catch {}
}

// ── Disable ──────────────────────────────────────────────────────────

export function isUpdateCheckDisabled(): boolean {
  return existsSync(DISABLED_FILE);
}

export function disableUpdateCheck(): void {
  ensureStateDir();
  writeFileSync(DISABLED_FILE, "disabled", "utf-8");
}

export function enableUpdateCheck(): void {
  try { unlinkSync(DISABLED_FILE); } catch {}
}

// ── Remote fetch ─────────────────────────────────────────────────────

/** Fetch the remote VERSION. Returns null on failure. */
async function fetchRemoteVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(REMOTE_VERSION_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    if (!VERSION_REGEX.test(text)) return null;
    return text;
  } catch {
    return null;
  }
}

// ── Check for update ─────────────────────────────────────────────────

/** Check if an update is available. Uses cache, respects snooze + disable. */
export async function checkForUpdate(force = false): Promise<UpdateResult | null> {
  if (!force && isUpdateCheckDisabled()) return null;

  const local = readLocalVersion();
  if (local === "unknown") return null;

  // Check cache (unless forced)
  if (!force) {
    const cache = readCache();
    if (cache && !cache.stale) {
      if (cache.status === "UP_TO_DATE" && cache.versions[0] === local) {
        return { current: local, latest: local, available: false };
      }
      if (cache.status === "UPGRADE_AVAILABLE" && cache.versions[0] === local) {
        const latest = cache.versions[1] ?? local;
        if (isSnoozed(latest)) return null;
        return { current: local, latest, available: true };
      }
    }
  }

  // Fetch remote
  const remote = await fetchRemoteVersion();
  if (!remote) {
    // Network failure — don't cache, so next check retries
    return null;
  }

  if (local === remote) {
    writeCache(`UP_TO_DATE ${local}`);
    return { current: local, latest: remote, available: false };
  }

  // Versions differ — upgrade available
  writeCache(`UPGRADE_AVAILABLE ${local} ${remote}`);
  if (!force && isSnoozed(remote)) return null;
  return { current: local, latest: remote, available: true };
}

// ── Upgrade ──────────────────────────────────────────────────────────

/** Run the upgrade. Returns the new version string. */
export async function upgrade(): Promise<{ oldVersion: string; newVersion: string }> {
  const oldVersion = readLocalVersion();
  const install = detectInstallType();

  // Check git is available
  const gitCheck = Bun.spawnSync(["git", "--version"]);
  if (gitCheck.exitCode !== 0) {
    throw new Error("git is required for upgrade but not found on PATH.");
  }

  if (install.type === "git") {
    await upgradeGit(install.dir);
  } else {
    await upgradeVendored(install.dir);
  }

  // Write marker for post-upgrade message
  ensureStateDir();
  writeFileSync(MARKER_FILE, oldVersion, "utf-8");

  // Clear cache and snooze
  try { unlinkSync(CACHE_FILE); } catch {}
  clearSnooze();

  const newVersion = readLocalVersion();
  return { oldVersion, newVersion };
}

async function upgradeGit(dir: string): Promise<void> {
  console.log(`  Pulling latest from origin/main...`);
  const pull = Bun.spawnSync(["git", "pull", "origin", "main"], {
    cwd: dir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (pull.exitCode !== 0) {
    throw new Error("git pull failed. Check your network connection and try again.");
  }

  console.log(`  Running setup...`);
  const setup = Bun.spawnSync(["./setup"], {
    cwd: dir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (setup.exitCode !== 0) {
    throw new Error("Setup failed after pull. Run ./setup manually to investigate.");
  }
}

async function upgradeVendored(dir: string): Promise<void> {
  const backupDir = `${dir}.bak`;
  const tmpDir = resolve(dirname(dir), `.dashcli-upgrade-tmp-${Date.now()}`);

  // Clean up stale backup from a previous failed upgrade
  if (existsSync(backupDir)) {
    rmSync(backupDir, { recursive: true, force: true });
  }

  try {
    console.log(`  Cloning latest version...`);
    const clone = Bun.spawnSync(
      ["git", "clone", "--depth", "1", "https://github.com/agi-bootstrap/dashcli.git", tmpDir],
      { stdout: "inherit", stderr: "inherit" }
    );
    if (clone.exitCode !== 0) {
      throw new Error("git clone failed. Check your network connection and try again.");
    }

    // Swap directories
    console.log(`  Upgrading...`);
    renameSync(dir, backupDir);
    renameSync(tmpDir, dir);

    // Remove .git to keep it vendored
    rmSync(resolve(dir, ".git"), { recursive: true, force: true });

    // Run setup
    console.log(`  Running setup...`);
    const setup = Bun.spawnSync(["./setup"], {
      cwd: dir,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (setup.exitCode !== 0) {
      // Restore from backup
      console.error("  Setup failed. Restoring previous version...");
      rmSync(dir, { recursive: true, force: true });
      renameSync(backupDir, dir);
      throw new Error("Setup failed after upgrade. Previous version restored.");
    }

    // Cleanup backup
    rmSync(backupDir, { recursive: true, force: true });
  } catch (err) {
    // Cleanup tmp if it still exists
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    // Restore backup if swap happened but setup failed
    if (existsSync(backupDir)) {
      if (!existsSync(dir)) {
        renameSync(backupDir, dir);
      } else {
        rmSync(backupDir, { recursive: true, force: true });
      }
    }
    throw err;
  }
}

// ── Changelog ────────────────────────────────────────────────────────

/** Extract changelog entries between two versions. Cap at 5000 chars to avoid dumping entire history. */
export function getChangelogBetween(oldVersion: string, newVersion: string): string | null {
  const changelogPath = resolve(getInstallDir(), "CHANGELOG.md");
  if (!existsSync(changelogPath)) return null;

  const content = readFileSync(changelogPath, "utf-8");
  const lines = content.split("\n");
  const result: string[] = [];
  let capturing = false;
  let charCount = 0;

  for (const line of lines) {
    const match = line.match(/^## \[([^\]]+)\]/);
    if (match) {
      const ver = match[1];
      if (ver === oldVersion) break;
      if (ver === newVersion || capturing) {
        capturing = true;
      }
    }
    if (capturing) {
      result.push(line);
      charCount += line.length;
      if (charCount > 5000) break;
    }
  }

  return result.length > 0 ? result.join("\n").trim() : null;
}

// ── Serve hint (non-blocking) ────────────────────────────────────────

/** Print a non-blocking upgrade hint. Fire-and-forget. */
export function printUpgradeHint(): void {
  checkForUpdate().then((result) => {
    if (result?.available) {
      console.error(`  dashcli v${result.current} (update available: v${result.latest} — run dashcli upgrade)`);
    }
  }).catch(() => {
    // Silent failure — never block serve
  });
}
