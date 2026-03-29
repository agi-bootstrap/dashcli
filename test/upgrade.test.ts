import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, utimesSync } from "fs";
import { resolve } from "path";
import {
  readLocalVersion,
  detectInstallType,
  readCache,
  isSnoozed,
  writeSnooze,
  disableUpdateCheck,
  enableUpdateCheck,
  isUpdateCheckDisabled,
  getChangelogBetween,
  checkForUpdate,
  readUpgradeMarker,
  getInstallDir,
  printUpgradeHint,
} from "../src/upgrade";

const HOME = process.env.HOME!;
const STATE_DIR = resolve(HOME, ".dashcli");
const CACHE_FILE = resolve(STATE_DIR, ".last-update-check");
const SNOOZE_FILE = resolve(STATE_DIR, ".update-snoozed");
const DISABLED_FILE = resolve(STATE_DIR, ".update-check-disabled");
const MARKER_FILE = resolve(STATE_DIR, ".just-upgraded-from");

// Helper: save and restore a state file around a test
function withStateFile(path: string, fn: () => void) {
  const existed = existsSync(path);
  const backup = existed ? readFileSync(path, "utf-8") : null;
  try {
    fn();
  } finally {
    if (backup !== null) {
      writeFileSync(path, backup, "utf-8");
    } else if (existsSync(path)) {
      rmSync(path);
    }
  }
}

// ── getInstallDir ────────────────────────────────────────────────────

describe("getInstallDir", () => {
  test("returns directory containing src/", () => {
    const dir = getInstallDir();
    expect(existsSync(resolve(dir, "src"))).toBe(true);
    expect(existsSync(resolve(dir, "VERSION"))).toBe(true);
  });
});

// ── readLocalVersion ─────────────────────────────────────────────────

describe("readLocalVersion", () => {
  test("returns trimmed version from VERSION file", () => {
    const version = readLocalVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("version matches content of VERSION file", () => {
    const version = readLocalVersion();
    const fileContent = readFileSync(resolve(getInstallDir(), "VERSION"), "utf-8").trim();
    expect(version).toBe(fileContent);
  });
});

// ── detectInstallType ────────────────────────────────────────────────

describe("detectInstallType", () => {
  test("detects git install when .git exists", () => {
    const result = detectInstallType();
    // In test environment (worktree), .git exists as a file pointing to the main repo
    expect(result.type).toBe("git");
    expect(result.dir).toBe(getInstallDir());
  });

  test("returns dir path that actually exists", () => {
    const result = detectInstallType();
    expect(existsSync(result.dir)).toBe(true);
  });
});

// ── VERSION format validation ────────────────────────────────────────

describe("version format validation", () => {
  const VERSION_REGEX = /^\d+(\.\d+)+$/;

  test("valid versions", () => {
    expect(VERSION_REGEX.test("0.1.6.0")).toBe(true);
    expect(VERSION_REGEX.test("1.0.0")).toBe(true);
    expect(VERSION_REGEX.test("0.2.0")).toBe(true);
    expect(VERSION_REGEX.test("10.20.30")).toBe(true);
    expect(VERSION_REGEX.test("0.0.1")).toBe(true);
  });

  test("invalid versions rejected", () => {
    expect(VERSION_REGEX.test("")).toBe(false);
    expect(VERSION_REGEX.test("abc")).toBe(false);
    expect(VERSION_REGEX.test("1")).toBe(false);
    expect(VERSION_REGEX.test("<html>")).toBe(false);
    expect(VERSION_REGEX.test("v1.0.0")).toBe(false);
    expect(VERSION_REGEX.test("1.0.0-beta")).toBe(false);
    expect(VERSION_REGEX.test("null")).toBe(false);
    expect(VERSION_REGEX.test(" 1.0.0")).toBe(false);
  });
});

// ── readCache ────────────────────────────────────────────────────────

describe("readCache", () => {
  afterEach(() => {
    try { rmSync(CACHE_FILE); } catch {}
  });

  test("returns null when no cache file", () => {
    withStateFile(CACHE_FILE, () => {
      try { rmSync(CACHE_FILE); } catch {}
      expect(readCache()).toBeNull();
    });
  });

  test("reads UP_TO_DATE cache (fresh)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UP_TO_DATE 0.1.6.0", "utf-8");
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.status).toBe("UP_TO_DATE");
      expect(cache!.versions).toEqual(["0.1.6.0"]);
      expect(cache!.stale).toBe(false); // just written
    });
  });

  test("reads UPGRADE_AVAILABLE cache (fresh)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UPGRADE_AVAILABLE 0.1.6.0 0.2.0", "utf-8");
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.status).toBe("UPGRADE_AVAILABLE");
      expect(cache!.versions).toEqual(["0.1.6.0", "0.2.0"]);
      expect(cache!.stale).toBe(false);
    });
  });

  test("detects stale UP_TO_DATE cache (>60 min old)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UP_TO_DATE 0.1.6.0", "utf-8");
      // Set mtime to 61 minutes ago
      const pastTime = new Date(Date.now() - 61 * 60 * 1000);
      utimesSync(CACHE_FILE, pastTime, pastTime);
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.stale).toBe(true);
    });
  });

  test("UPGRADE_AVAILABLE cache is fresh within 720 min", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UPGRADE_AVAILABLE 0.1.6.0 0.2.0", "utf-8");
      // Set mtime to 100 minutes ago (within 720 min TTL)
      const pastTime = new Date(Date.now() - 100 * 60 * 1000);
      utimesSync(CACHE_FILE, pastTime, pastTime);
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.stale).toBe(false);
    });
  });

  test("detects stale UPGRADE_AVAILABLE cache (>720 min old)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UPGRADE_AVAILABLE 0.1.6.0 0.2.0", "utf-8");
      // Set mtime to 721 minutes ago
      const pastTime = new Date(Date.now() - 721 * 60 * 1000);
      utimesSync(CACHE_FILE, pastTime, pastTime);
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.stale).toBe(true);
    });
  });

  test("returns null for corrupt cache content", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "GARBAGE nonsense", "utf-8");
      expect(readCache()).toBeNull();
    });
  });

  test("returns null for empty cache file", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "", "utf-8");
      expect(readCache()).toBeNull();
    });
  });

  test("handles status with no version (e.g., 'UP_TO_DATE' alone)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UP_TO_DATE", "utf-8");
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.status).toBe("UP_TO_DATE");
      expect(cache!.versions).toEqual([]); // no versions parsed
    });
  });

  test("handles extra spaces in cache line", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UPGRADE_AVAILABLE 0.1.5.0 0.2.0 extra", "utf-8");
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.status).toBe("UPGRADE_AVAILABLE");
      expect(cache!.versions).toEqual(["0.1.5.0", "0.2.0", "extra"]);
    });
  });

  test("future mtime treated as fresh (clock skew)", () => {
    withStateFile(CACHE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CACHE_FILE, "UP_TO_DATE 0.1.6.0", "utf-8");
      // Set mtime to 1 hour in the future
      const futureTime = new Date(Date.now() + 60 * 60 * 1000);
      utimesSync(CACHE_FILE, futureTime, futureTime);
      const cache = readCache();
      expect(cache).not.toBeNull();
      expect(cache!.stale).toBe(false); // negative age = not stale
    });
  });
});

// ── readUpgradeMarker ────────────────────────────────────────────────

describe("readUpgradeMarker", () => {
  test("returns null when no marker file", () => {
    withStateFile(MARKER_FILE, () => {
      try { rmSync(MARKER_FILE); } catch {}
      expect(readUpgradeMarker()).toBeNull();
    });
  });

  test("reads marker and deletes it", () => {
    withStateFile(MARKER_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(MARKER_FILE, "0.1.5.0", "utf-8");
      const result = readUpgradeMarker();
      expect(result).toBe("0.1.5.0");
      expect(existsSync(MARKER_FILE)).toBe(false);
    });
  });

  test("returns null for empty marker file", () => {
    withStateFile(MARKER_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(MARKER_FILE, "", "utf-8");
      const result = readUpgradeMarker();
      expect(result).toBeNull();
      expect(existsSync(MARKER_FILE)).toBe(false);
    });
  });

  test("trims whitespace from marker content", () => {
    withStateFile(MARKER_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(MARKER_FILE, "  0.1.5.0\n  ", "utf-8");
      const result = readUpgradeMarker();
      expect(result).toBe("0.1.5.0");
    });
  });

  test("returns null for whitespace-only marker file", () => {
    withStateFile(MARKER_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(MARKER_FILE, "   \n  ", "utf-8");
      const result = readUpgradeMarker();
      expect(result).toBeNull();
      expect(existsSync(MARKER_FILE)).toBe(false);
    });
  });
});

// ── Snooze logic ─────────────────────────────────────────────────────

describe("snooze", () => {
  test("writeSnooze escalates levels", () => {
    withStateFile(SNOOZE_FILE, () => {
      try { rmSync(SNOOZE_FILE); } catch {}
      const r1 = writeSnooze("1.0.0");
      expect(r1.level).toBe(1);
      expect(r1.durationLabel).toBe("24 hours");

      const r2 = writeSnooze("1.0.0");
      expect(r2.level).toBe(2);
      expect(r2.durationLabel).toBe("48 hours");

      const r3 = writeSnooze("1.0.0");
      expect(r3.level).toBe(3);
      expect(r3.durationLabel).toBe("1 week");

      // Caps at level 3
      const r4 = writeSnooze("1.0.0");
      expect(r4.level).toBe(3);
    });
  });

  test("new version resets snooze level", () => {
    withStateFile(SNOOZE_FILE, () => {
      try { rmSync(SNOOZE_FILE); } catch {}
      writeSnooze("1.0.0");
      writeSnooze("1.0.0");
      const r = writeSnooze("2.0.0");
      expect(r.level).toBe(1);
    });
  });

  test("isSnoozed returns false when no snooze file", () => {
    withStateFile(SNOOZE_FILE, () => {
      try { rmSync(SNOOZE_FILE); } catch {}
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed returns true for recently snoozed version", () => {
    withStateFile(SNOOZE_FILE, () => {
      try { rmSync(SNOOZE_FILE); } catch {}
      writeSnooze("1.0.0");
      expect(isSnoozed("1.0.0")).toBe(true);
    });
  });

  test("isSnoozed returns false for different version", () => {
    withStateFile(SNOOZE_FILE, () => {
      try { rmSync(SNOOZE_FILE); } catch {}
      writeSnooze("1.0.0");
      expect(isSnoozed("2.0.0")).toBe(false);
    });
  });

  test("isSnoozed returns false when snooze expired", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      // Write a snooze that expired 1 second ago (epoch in the past)
      const pastEpoch = Math.floor(Date.now() / 1000) - 86401; // 24h + 1s ago
      writeFileSync(SNOOZE_FILE, `1.0.0 1 ${pastEpoch}`, "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed handles corrupt snooze file", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(SNOOZE_FILE, "garbage", "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed handles partially corrupt snooze file", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(SNOOZE_FILE, "1.0.0 abc def", "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed respects level 2 duration (48h)", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      // Level 2 = 48h. Set epoch to 47h ago — should still be snoozed
      const epoch = Math.floor(Date.now() / 1000) - (47 * 3600);
      writeFileSync(SNOOZE_FILE, `1.0.0 2 ${epoch}`, "utf-8");
      expect(isSnoozed("1.0.0")).toBe(true);
    });
  });

  test("isSnoozed level 2 expires after 48h", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      // Level 2 = 48h. Set epoch to 49h ago — should be expired
      const epoch = Math.floor(Date.now() / 1000) - (49 * 3600);
      writeFileSync(SNOOZE_FILE, `1.0.0 2 ${epoch}`, "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed respects level 3 duration (7 days)", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      // Level 3 = 7 days. Set epoch to 6 days ago — should still be snoozed
      const epoch = Math.floor(Date.now() / 1000) - (6 * 86400);
      writeFileSync(SNOOZE_FILE, `1.0.0 3 ${epoch}`, "utf-8");
      expect(isSnoozed("1.0.0")).toBe(true);
    });
  });

  test("isSnoozed level 3 expires after 7 days", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      // Level 3 = 7 days. Set epoch to 8 days ago — should be expired
      const epoch = Math.floor(Date.now() / 1000) - (8 * 86400);
      writeFileSync(SNOOZE_FILE, `1.0.0 3 ${epoch}`, "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed with too-short snooze file (missing fields)", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(SNOOZE_FILE, "1.0.0 2", "utf-8"); // missing epoch
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });

  test("isSnoozed with empty snooze file", () => {
    withStateFile(SNOOZE_FILE, () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(SNOOZE_FILE, "", "utf-8");
      expect(isSnoozed("1.0.0")).toBe(false);
    });
  });
});

// ── Update check disable ─────────────────────────────────────────────

describe("update check disable", () => {
  test("disable and enable round-trip", () => {
    withStateFile(DISABLED_FILE, () => {
      enableUpdateCheck(); // start clean
      expect(isUpdateCheckDisabled()).toBe(false);

      disableUpdateCheck();
      expect(isUpdateCheckDisabled()).toBe(true);

      enableUpdateCheck();
      expect(isUpdateCheckDisabled()).toBe(false);
    });
  });

  test("enableUpdateCheck is safe when not disabled", () => {
    withStateFile(DISABLED_FILE, () => {
      enableUpdateCheck();
      // Should not throw
      enableUpdateCheck();
      expect(isUpdateCheckDisabled()).toBe(false);
    });
  });
});

// ── checkForUpdate ───────────────────────────────────────────────────

describe("checkForUpdate", () => {
  // Save and restore all state files around these tests
  let savedCache: string | null = null;
  let savedSnooze: string | null = null;
  let savedDisabled: boolean = false;

  beforeEach(() => {
    savedCache = existsSync(CACHE_FILE) ? readFileSync(CACHE_FILE, "utf-8") : null;
    savedSnooze = existsSync(SNOOZE_FILE) ? readFileSync(SNOOZE_FILE, "utf-8") : null;
    savedDisabled = existsSync(DISABLED_FILE);
    // Clean slate
    try { rmSync(CACHE_FILE); } catch {}
    try { rmSync(SNOOZE_FILE); } catch {}
    try { rmSync(DISABLED_FILE); } catch {}
  });

  afterEach(() => {
    // Restore
    try { rmSync(CACHE_FILE); } catch {}
    try { rmSync(SNOOZE_FILE); } catch {}
    try { rmSync(DISABLED_FILE); } catch {}
    if (savedCache !== null) writeFileSync(CACHE_FILE, savedCache, "utf-8");
    if (savedSnooze !== null) writeFileSync(SNOOZE_FILE, savedSnooze, "utf-8");
    if (savedDisabled) writeFileSync(DISABLED_FILE, "disabled", "utf-8");
  });

  test("returns null when update check is disabled (non-forced)", async () => {
    disableUpdateCheck();
    const result = await checkForUpdate(false);
    expect(result).toBeNull();
  });

  test("force bypasses disabled check", async () => {
    disableUpdateCheck();
    const result = await checkForUpdate(true);
    // Either returns a result (network success) or null (network failure)
    // but NOT null due to disabled — force bypasses it
    // We verify by also checking non-forced returns null
    const nonForced = await checkForUpdate(false);
    expect(nonForced).toBeNull(); // disabled blocks non-forced
    // Force result: can't guarantee network, just verify no throw
    expect(result === null || typeof result === "object").toBe(true);
  });

  test("returns cached UP_TO_DATE without network call", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `UP_TO_DATE ${local}`, "utf-8");

    const result = await checkForUpdate(false);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(local);
    expect(result!.available).toBe(false);
  });

  test("returns cached UPGRADE_AVAILABLE without network call", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `UPGRADE_AVAILABLE ${local} 99.99.99`, "utf-8");

    const result = await checkForUpdate(false);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(local);
    expect(result!.latest).toBe("99.99.99");
    expect(result!.available).toBe(true);
  });

  test("cached UPGRADE_AVAILABLE returns null when snoozed", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `UPGRADE_AVAILABLE ${local} 99.99.99`, "utf-8");
    writeSnooze("99.99.99");

    const result = await checkForUpdate(false);
    expect(result).toBeNull();
  });

  test("force check fetches from remote (real network)", async () => {
    const result = await checkForUpdate(true);
    if (result) {
      expect(result.current).toBeTruthy();
      expect(result.latest).toBeTruthy();
      expect(typeof result.available).toBe("boolean");
    }
    // null is acceptable (network failure in CI)
  });

  test("stale cache triggers re-fetch", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `UP_TO_DATE ${local}`, "utf-8");
    // Make cache 61 minutes old (past UP_TO_DATE TTL)
    const pastTime = new Date(Date.now() - 61 * 60 * 1000);
    utimesSync(CACHE_FILE, pastTime, pastTime);

    const result = await checkForUpdate(false);
    // Should have re-fetched (stale cache). Result depends on network.
    if (result) {
      expect(result.current).toBe(local);
    }
  });

  test("cache with mismatched local version is ignored (falls through to fetch)", async () => {
    // Cache says UP_TO_DATE for an old version, but local VERSION is different now
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, "UP_TO_DATE 0.0.1", "utf-8"); // stale cached version
    const local = readLocalVersion();
    expect(local).not.toBe("0.0.1"); // ensure mismatch

    const result = await checkForUpdate(false);
    // Cache mismatch means it should fall through to network fetch
    // Result depends on network, but should not return the stale cached result
    if (result) {
      expect(result.current).toBe(local);
    }
  });

  test("force bypasses snooze on cached UPGRADE_AVAILABLE", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, `UPGRADE_AVAILABLE ${local} 99.99.99`, "utf-8");
    writeSnooze("99.99.99"); // snooze the version

    // Non-forced should return null (snoozed)
    const snoozed = await checkForUpdate(false);
    expect(snoozed).toBeNull();

    // Forced should bypass snooze (but also bypass cache, so it fetches remote)
    // Since force=true bypasses cache entirely, it fetches the real remote version
    const forced = await checkForUpdate(true);
    // Can't assert on value (depends on network), but it shouldn't be null from snooze
    if (forced) {
      expect(forced.current).toBe(local);
    }
  });

  test("cache with no version in UP_TO_DATE line falls through", async () => {
    const local = readLocalVersion();
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, "UP_TO_DATE", "utf-8"); // no version after status

    const result = await checkForUpdate(false);
    // versions[0] is undefined, so cache.versions[0] === local is false
    // Falls through to network fetch
    if (result) {
      expect(result.current).toBe(local);
    }
  });
});

// ── Changelog extraction ─────────────────────────────────────────────

describe("getChangelogBetween", () => {
  test("extracts entries between two known versions", () => {
    const result = getChangelogBetween("0.1.5.0", "0.1.6.0");
    if (result) {
      expect(result).toContain("0.1.6.0");
      expect(result).not.toContain("## [0.1.5.0]");
    }
  });

  test("captures intermediate versions", () => {
    // 0.1.6.0 and 0.1.5.1 are both between 0.1.5.0 and 0.1.6.0
    const result = getChangelogBetween("0.1.4.0", "0.1.6.0");
    if (result) {
      expect(result).toContain("0.1.6.0");
      expect(result).toContain("0.1.5");
      expect(result).not.toContain("## [0.1.4.0]");
    }
  });

  test("returns null for unknown newVersion", () => {
    const result = getChangelogBetween("0.1.5.0", "100.0.0");
    expect(result).toBeNull();
  });

  test("returns null for both versions unknown", () => {
    const result = getChangelogBetween("99.99.99", "100.0.0");
    expect(result).toBeNull();
  });

  test("caps output at 5000 chars", () => {
    // Request a very large range (from beginning to latest)
    const result = getChangelogBetween("0.0.0", "0.1.6.0");
    if (result) {
      // Should be capped, not the entire changelog
      expect(result.length).toBeLessThanOrEqual(6000); // some slack for last line
    }
  });

  test("returns null when old and new version are the same", () => {
    // Same version: loop hits oldVersion match immediately after starting capture
    const result = getChangelogBetween("0.1.6.0", "0.1.6.0");
    // The loop would start capturing at newVersion, then break at oldVersion (same line)
    // Result: just the header line itself
    expect(result).toBeNull();
  });

  test("extracts single version when old is the previous entry", () => {
    // Should capture exactly the 0.1.6.0 block
    const result = getChangelogBetween("0.1.5.1", "0.1.6.0");
    if (result) {
      expect(result).toContain("0.1.6.0");
      // Should NOT contain the 0.1.5.1 header (that's the break point)
      expect(result).not.toContain("## [0.1.5.1]");
    }
  });

  test("returns non-empty result for latest version to earliest", () => {
    // From the very first version to the latest — should capture everything (capped)
    const result = getChangelogBetween("0.1.0.0", "0.1.6.0");
    if (result) {
      expect(result).toContain("0.1.6.0");
      expect(result.length).toBeGreaterThan(100);
    }
  });
});

// ── printUpgradeHint ─────────────────────────────────────────────────

describe("printUpgradeHint", () => {
  test("does not throw (fire-and-forget)", () => {
    // printUpgradeHint is async fire-and-forget — it should never throw
    expect(() => printUpgradeHint()).not.toThrow();
  });
});

// ── CLI integration ──────────────────────────────────────────────────

describe("CLI: dashcli version", () => {
  const root = resolve(import.meta.dir, "..");

  test("prints version string", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
    });
    const out = result.stdout.toString().trim();
    expect(out).toMatch(/dashcli v\d+\.\d+/);
    expect(result.exitCode).toBe(0);
  });

  test("--json outputs envelope with version", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version", "--json"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
    });
    const out = result.stdout.toString().trim();
    const json = JSON.parse(out);
    expect(json.ok).toBe(true);
    expect(json.data.version).toMatch(/^\d+\.\d+/);
  });

  test("--check fetches remote and reports status", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version", "--check"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 15000,
    });
    const out = result.stdout.toString().trim();
    // Should say either "up to date" or "update available"
    expect(out).toMatch(/dashcli v\d+\.\d+/);
    expect(result.exitCode).toBe(0);
  });

  test("--check --json outputs envelope with latest and updateAvailable", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version", "--check", "--json"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 15000,
    });
    const out = result.stdout.toString().trim();
    const json = JSON.parse(out);
    expect(json.ok).toBe(true);
    expect(json.data.version).toBeTruthy();
    expect(typeof json.data.updateAvailable).toBe("boolean");
    expect(json.data.latest).toBeTruthy();
  });

  test("shows post-upgrade message when marker exists", () => {
    // Write a marker file
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(MARKER_FILE, "0.1.5.0", "utf-8");
    try {
      const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version"], {
        cwd: root,
        env: { ...process.env, HOME: process.env.HOME },
      });
      const out = result.stdout.toString();
      expect(out).toContain("upgraded from v0.1.5.0");
      expect(result.exitCode).toBe(0);
      // Marker should be deleted
      expect(existsSync(MARKER_FILE)).toBe(false);
    } finally {
      try { rmSync(MARKER_FILE); } catch {}
    }
  });

  test("post-upgrade --json includes upgradedFrom", () => {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(MARKER_FILE, "0.1.5.0", "utf-8");
    try {
      const result = Bun.spawnSync(["bun", "run", "src/index.ts", "version", "--json"], {
        cwd: root,
        env: { ...process.env, HOME: process.env.HOME },
      });
      const out = result.stdout.toString().trim();
      const json = JSON.parse(out);
      expect(json.ok).toBe(true);
      expect(json.data.upgradedFrom).toBe("0.1.5.0");
    } finally {
      try { rmSync(MARKER_FILE); } catch {}
    }
  });
});

describe("CLI: dashcli upgrade", () => {
  const root = resolve(import.meta.dir, "..");

  test("does not crash with unexpected errors", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "upgrade"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 15000,
    });
    const stderr = result.stderr.toString();
    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("ReferenceError");
    expect(stderr).not.toContain("SyntaxError");
  });

  test("shows version and checking message", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "upgrade"], {
      cwd: root,
      env: { ...process.env, HOME: process.env.HOME },
      timeout: 15000,
    });
    const out = result.stdout.toString();
    expect(out).toContain("dashcli v");
    expect(out).toContain("Checking for updates");
  });

  // Note: dashcli upgrade --json is not tested here because runUpgrade always
  // forces a remote fetch, and when local version differs from remote (common
  // during development), it attempts a real git pull that contaminates stdout.
  // JSON mode for upgrade is tested indirectly via version --json tests.
});

describe("CLI: dashcli help includes new commands", () => {
  const root = resolve(import.meta.dir, "..");

  test("help text includes version and upgrade", () => {
    const result = Bun.spawnSync(["bun", "run", "src/index.ts", "--help"], {
      cwd: root,
    });
    const out = result.stdout.toString();
    expect(out).toContain("dashcli version");
    expect(out).toContain("dashcli upgrade");
  });
});
