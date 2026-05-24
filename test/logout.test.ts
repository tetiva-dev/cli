import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLogout } from "../src/commands/logout.js";
import { loadCredentials, saveCredentials } from "../src/credentials.js";

const ON_POSIX = process.platform !== "win32";

describe("tetiva logout", () => {
  let home: string;
  let envBackup: NodeJS.ProcessEnv;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tetiva-logout-"));
    envBackup = { ...process.env };
    if (ON_POSIX) {
      process.env.TETIVA_HOME = home;
    } else {
      process.env.APPDATA = home;
    }
  });

  afterEach(() => {
    process.env = envBackup;
    rmSync(home, { recursive: true, force: true });
  });

  it("removes an existing credentials file", async () => {
    await saveCredentials({ token: "abc" });
    expect(await loadCredentials()).toEqual({ token: "abc" });
    const result = await runLogout();
    expect(result.removed).toBe(true);
    expect(await loadCredentials()).toBeNull();
  });

  it("is a silent no-op when already signed out", async () => {
    const result = await runLogout();
    expect(result.removed).toBe(false);
  });
});
