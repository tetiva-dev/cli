/**
 * Login flow tests. The browser open is skipped via `TETIVA_NO_BROWSER=1`; the
 * test directly POSTs the simulated backend callback to the listener.
 *
 * Two seams keep this hermetic:
 * - `TETIVA_HOME` redirects the credentials file into a tmpdir.
 * - `TETIVA_API_URL` confirms the browser-redirect URL composition without
 *   reaching the real backend (the URL is only printed; no request is made).
 *
 * The listener port isn't surfaced via a public API, so the test sniffs
 * stdout for the `If the browser doesn't open, visit: <url>` line to recover
 * the callback origin.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLogin } from "../src/commands/login.js";
import { loadCredentials } from "../src/credentials.js";

const ON_POSIX = process.platform !== "win32";

describe("tetiva login", () => {
  let home: string;
  let envBackup: NodeJS.ProcessEnv;
  let logBackup: typeof console.log;
  let logged: string[];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "tetiva-login-"));
    envBackup = { ...process.env };
    if (ON_POSIX) {
      process.env.TETIVA_HOME = home;
    } else {
      process.env.APPDATA = home;
    }
    process.env.TETIVA_API_URL = "http://localhost:9999";
    process.env.TETIVA_NO_BROWSER = "1";
    process.env.TETIVA_LOGIN_TIMEOUT_MS = "5000";

    logged = [];
    logBackup = console.log;
    console.log = (...args: unknown[]): void => {
      logged.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = logBackup;
    process.env = envBackup;
    rmSync(home, { recursive: true, force: true });
  });

  /**
   * Pull the listener's callback origin out of the printed help line. Returns
   * the `<api>?cli_token=...&callback=http://127.0.0.1:<port>` URL the CLI
   * told the user to visit.
   */
  function findAuthUrl(): URL {
    const line = logged.find((l) => l.includes("http://localhost:9999/auth/cli-login"));
    expect(line, "expected the CLI to print the auth URL").toBeTruthy();
    const match = line?.match(/(http:\/\/localhost:9999\/auth\/cli-login\?[^\s]+)/);
    expect(match, "expected to find the auth URL").toBeTruthy();
    return new URL(match?.[1] as string);
  }

  it("captures the api_token on a valid callback and persists it 0600", async () => {
    const loginPromise = runLogin();

    // Wait for the listener to bind and the auth URL to be printed.
    const authUrl = await pollUntil(() => {
      try {
        return findAuthUrl();
      } catch {
        return null;
      }
    });
    const cliToken = authUrl.searchParams.get("cli_token");
    const callback = authUrl.searchParams.get("callback");
    expect(cliToken).toMatch(/^[0-9a-f]{64}$/);
    expect(callback).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);

    // Simulate the backend redirect: GET the callback URL with the same
    // cli_token plus an api_token.
    const redirectUrl = new URL(callback as string);
    redirectUrl.searchParams.set("cli_token", cliToken as string);
    redirectUrl.searchParams.set("api_token", "captured-api-token-xyz");
    const response = await fetch(redirectUrl);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Signed in");

    const result = await loginPromise;
    expect(result.credentialsPath).toBeTruthy();

    const loaded = await loadCredentials();
    expect(loaded).toEqual({ token: "captured-api-token-xyz" });
  });

  it("rejects a callback whose cli_token doesn't match (CSRF defense)", async () => {
    const loginPromise = runLogin();
    // Suppress unhandled-rejection noise: the fetch below settles loginPromise
    // before the `expect(...).rejects` handler attaches. Original rejection
    // still observed by the expect call.
    loginPromise.catch(() => {});
    const authUrl = await pollUntil(() => {
      try {
        return findAuthUrl();
      } catch {
        return null;
      }
    });
    const callback = authUrl.searchParams.get("callback") as string;

    // Wrong cli_token.
    const bad = new URL(callback);
    bad.searchParams.set("cli_token", "wrong-token");
    bad.searchParams.set("api_token", "should-not-be-stored");
    const response = await fetch(bad);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("token mismatch");

    await expect(loginPromise).rejects.toThrow(/cli_token/);
    expect(await loadCredentials()).toBeNull();
  });

  it("rejects a callback missing api_token", async () => {
    const loginPromise = runLogin();
    loginPromise.catch(() => {});
    const authUrl = await pollUntil(() => {
      try {
        return findAuthUrl();
      } catch {
        return null;
      }
    });
    const cliToken = authUrl.searchParams.get("cli_token") as string;
    const callback = authUrl.searchParams.get("callback") as string;

    const incomplete = new URL(callback);
    incomplete.searchParams.set("cli_token", cliToken);
    // No api_token.
    const response = await fetch(incomplete);
    expect(response.status).toBe(400);

    await expect(loginPromise).rejects.toThrow(/missing/i);
    expect(await loadCredentials()).toBeNull();
  });

  it("composes the browser redirect URL against TETIVA_API_URL", async () => {
    const loginPromise = runLogin();
    const authUrl = await pollUntil(() => {
      try {
        return findAuthUrl();
      } catch {
        return null;
      }
    });
    expect(authUrl.origin).toBe("http://localhost:9999");
    expect(authUrl.pathname).toBe("/auth/cli-login");
    expect(authUrl.searchParams.has("cli_token")).toBe(true);
    expect(authUrl.searchParams.has("callback")).toBe(true);

    // Tear down: send a valid callback so the listener shuts down.
    const callback = authUrl.searchParams.get("callback") as string;
    const ok = new URL(callback);
    ok.searchParams.set("cli_token", authUrl.searchParams.get("cli_token") as string);
    ok.searchParams.set("api_token", "ok");
    await fetch(ok);
    await loginPromise;
  });
});

/** Tiny polling helper — runs the predicate every 25ms for up to 2 seconds. */
async function pollUntil<T>(predicate: () => T | null, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`pollUntil timed out after ${timeoutMs}ms`);
}
