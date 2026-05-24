import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCredentials,
  credentialsMode,
  credentialsPath,
  loadCredentials,
  saveCredentials,
} from "../src/credentials.js";

/**
 * Each test gets its own `TETIVA_HOME` (POSIX) / `APPDATA` (Windows) so the
 * real user home is never touched. The env is restored at teardown so other
 * tests don't see the override.
 */

const ON_POSIX = process.platform !== "win32";

describe("credentials storage", () => {
  let home: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tetiva-creds-"));
    env = { ...process.env };
    // On POSIX, APPDATA is normally unset (so no override needed); on Windows
    // TETIVA_HOME is normally unset (likewise). The full env restore in
    // afterEach catches anything we did pollute.
    if (ON_POSIX) {
      process.env.TETIVA_HOME = home;
    } else {
      process.env.APPDATA = home;
    }
  });

  afterEach(() => {
    process.env = env;
    rmSync(home, { recursive: true, force: true });
  });

  it("returns null when no credentials exist", async () => {
    expect(await loadCredentials()).toBeNull();
    expect(await credentialsMode()).toBeNull();
  });

  it("round-trips a token through save/load", async () => {
    await saveCredentials({ token: "opaque-token-abc-123" });
    const loaded = await loadCredentials();
    expect(loaded).toEqual({ token: "opaque-token-abc-123" });
  });

  it.skipIf(!ON_POSIX)("writes the POSIX file with 0600 permissions", async () => {
    await saveCredentials({ token: "perms-test-token" });
    const mode = await credentialsMode();
    expect(mode).toBe(0o600);
  });

  it("places the file at the documented platform path", async () => {
    const path = credentialsPath();
    if (ON_POSIX) {
      expect(path).toBe(join(home, ".tetiva", "credentials"));
    } else {
      expect(path).toBe(join(home, "tetiva", "credentials.json"));
    }
  });

  it("rewrites the token on a second save (overwrite, not append)", async () => {
    await saveCredentials({ token: "first-token" });
    await saveCredentials({ token: "second-token" });
    const loaded = await loadCredentials();
    expect(loaded).toEqual({ token: "second-token" });
  });

  it.skipIf(!ON_POSIX)("preserves 0600 mode on overwrite", async () => {
    await saveCredentials({ token: "first" });
    await saveCredentials({ token: "second" });
    expect(await credentialsMode()).toBe(0o600);
  });

  it("clearCredentials removes the file", async () => {
    await saveCredentials({ token: "to-be-removed" });
    await clearCredentials();
    expect(await loadCredentials()).toBeNull();
  });

  it("clearCredentials is idempotent (no error if absent)", async () => {
    await expect(clearCredentials()).resolves.toBeUndefined();
    await expect(clearCredentials()).resolves.toBeUndefined();
  });

  it.skipIf(ON_POSIX)("Windows file is valid JSON with a token field", async () => {
    await saveCredentials({ token: "windows-token" });
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(credentialsPath(), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed).toEqual({ token: "windows-token" });
  });

  it("rejects a malformed file on load", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    const path = credentialsPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, ON_POSIX ? "" : "{}", "utf8");
    await expect(loadCredentials()).rejects.toThrow(/malformed/);
  });
});
