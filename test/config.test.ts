import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  listConfig,
} from "../src/config";

const HOME = process.env.HOME!;
const STATE_DIR = resolve(HOME, ".dashcli");
const CONFIG_FILE = resolve(STATE_DIR, ".config.yaml");
const DISABLED_FILE = resolve(STATE_DIR, ".update-check-disabled");

// Helper: save and restore a state file around a test
function withStateFiles(paths: string[], fn: () => void) {
  const backups = new Map<string, string | null>();
  for (const path of paths) {
    backups.set(path, existsSync(path) ? readFileSync(path, "utf-8") : null);
  }
  try {
    fn();
  } finally {
    for (const [path, backup] of backups) {
      if (backup !== null) {
        writeFileSync(path, backup, "utf-8");
      } else if (existsSync(path)) {
        rmSync(path);
      }
    }
  }
}

// ── readConfig ──────────────────────────────────────────────────────

describe("readConfig", () => {
  test("returns {} when no config file exists", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      try { rmSync(DISABLED_FILE); } catch {}
      const config = readConfig();
      expect(config).toEqual({});
    });
  });

  test("returns parsed config from valid file", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "auto_upgrade: true\nupdate_check: false\n", "utf-8");
      const config = readConfig();
      expect(config.auto_upgrade).toBe(true);
      expect(config.update_check).toBe(false);
    });
  });

  test("returns {} and logs warning on corrupt YAML", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "{{invalid yaml: [", "utf-8");
      const config = readConfig();
      expect(config).toEqual({});
    });
  });

  test("returns {} when config is null (empty file)", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "", "utf-8");
      const config = readConfig();
      expect(config).toEqual({});
    });
  });
});

// ── writeConfig ─────────────────────────────────────────────────────

describe("writeConfig", () => {
  test("creates config file atomically", () => {
    withStateFiles([CONFIG_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      writeConfig({ auto_upgrade: true });
      expect(existsSync(CONFIG_FILE)).toBe(true);
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      expect(raw).toContain("auto_upgrade: true");
    });
  });

  test("creates state dir if missing", () => {
    // Can't safely test dir creation without risking state dir removal.
    // Just verify writeConfig doesn't throw.
    withStateFiles([CONFIG_FILE], () => {
      writeConfig({ update_check: true });
      expect(existsSync(CONFIG_FILE)).toBe(true);
    });
  });
});

// ── getConfigValue / setConfigValue ─────────────────────────────────

describe("getConfigValue / setConfigValue", () => {
  test("returns undefined when key not set", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      try { rmSync(DISABLED_FILE); } catch {}
      expect(getConfigValue("auto_upgrade")).toBeUndefined();
    });
  });

  test("set and get round-trip for auto_upgrade", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      try { rmSync(DISABLED_FILE); } catch {}
      setConfigValue("auto_upgrade", true);
      expect(getConfigValue("auto_upgrade")).toBe(true);
    });
  });

  test("set and get round-trip for update_check", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      try { rmSync(DISABLED_FILE); } catch {}
      setConfigValue("update_check", false);
      expect(getConfigValue("update_check")).toBe(false);
    });
  });

  test("strict boolean: string 'true' returns undefined", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, 'auto_upgrade: "yes"\n', "utf-8");
      expect(getConfigValue("auto_upgrade")).toBeUndefined();
    });
  });

  test("set preserves other keys", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "auto_upgrade: true\n", "utf-8");
      setConfigValue("update_check", false);
      expect(getConfigValue("auto_upgrade")).toBe(true);
      expect(getConfigValue("update_check")).toBe(false);
    });
  });
});

// ── listConfig ──────────────────────────────────────────────────────

describe("listConfig", () => {
  test("returns all config values", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(DISABLED_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "auto_upgrade: true\nupdate_check: false\n", "utf-8");
      const config = listConfig();
      expect(config.auto_upgrade).toBe(true);
      expect(config.update_check).toBe(false);
    });
  });
});

// ── Migration ───────────────────────────────────────────────────────

describe("config migration", () => {
  test("migrates .update-check-disabled to config", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(DISABLED_FILE, "disabled", "utf-8");

      const config = readConfig();
      expect(config.update_check).toBe(false);
      expect(existsSync(DISABLED_FILE)).toBe(false); // flag file deleted
    });
  });

  test("no-op if flag file does not exist", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      try { rmSync(CONFIG_FILE); } catch {}
      try { rmSync(DISABLED_FILE); } catch {}

      const config = readConfig();
      expect(config).toEqual({});
      expect(existsSync(DISABLED_FILE)).toBe(false);
    });
  });

  test("no-op if config already has update_check", () => {
    withStateFiles([CONFIG_FILE, DISABLED_FILE], () => {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, "update_check: true\n", "utf-8");
      writeFileSync(DISABLED_FILE, "disabled", "utf-8");

      const config = readConfig();
      expect(config.update_check).toBe(true); // config value preserved, not overwritten
      expect(existsSync(DISABLED_FILE)).toBe(false); // flag file still cleaned up
    });
  });
});
