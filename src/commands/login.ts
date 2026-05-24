/**
 * `tetiva login` — OAuth-style browser flow with a localhost callback.
 *
 * Sequence:
 * 1. Bind a one-shot HTTP listener on `127.0.0.1` at an OS-assigned port.
 * 2. Generate an opaque `cli_token` (CSRF/state nonce).
 * 3. Open the user's default browser to
 *    `<api>/auth/cli-login?cli_token=<n>&callback=http://127.0.0.1:<port>`.
 * 4. Backend authenticates the user, then `302`s to the callback URL with
 *    `cli_token` and `api_token` in the query string.
 * 5. Listener validates `cli_token` matches (CSRF) and persists `api_token`
 *    via `saveCredentials`. Responds with a small HTML "you can close this
 *    tab" page and shuts down.
 *
 * Picked the listener shape over poll per TVA-24 launch prompt design notes:
 * better UX, industry standard (gh, gcloud). Timeout is 5 minutes.
 *
 * Test hooks (undocumented; only the harness sets them):
 * - `TETIVA_NO_BROWSER=1` skips the actual browser open (tests trigger the
 *   callback themselves).
 * - `TETIVA_LOGIN_TIMEOUT_MS=<ms>` overrides the 5-minute default so tests
 *   that exercise the timeout path don't wait 5 minutes.
 */

import { randomBytes } from "node:crypto";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import open from "open";
import { CliLoginCallbackQuery } from "../api-types.js";
import { resolveApiUrl } from "../config.js";
import { credentialsPath, saveCredentials } from "../credentials.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tetiva — signed in</title>
<style>body{font:14px -apple-system,Segoe UI,Roboto,sans-serif;max-width:32em;margin:4em auto;padding:0 1em;color:#222}</style>
</head><body><h1>Signed in</h1><p>You can close this tab and return to your terminal.</p></body></html>
`;

function failureHtml(message: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Tetiva — sign-in failed</title>
<style>body{font:14px -apple-system,Segoe UI,Roboto,sans-serif;max-width:32em;margin:4em auto;padding:0 1em;color:#222}</style>
</head><body><h1>Sign-in failed</h1><p>${message}</p><p>Return to your terminal to retry.</p></body></html>
`;
}

export interface LoginResult {
  /** Absolute path the credentials were written to. */
  credentialsPath: string;
}

export interface LoginOptions {
  /** Override the 5-minute wait timeout (test hook). */
  timeoutMs?: number;
  /** Skip the browser open (test hook). */
  openBrowser?: boolean;
}

/**
 * Run the login flow end to end. Resolves on successful credential capture;
 * rejects on timeout, on a `cli_token` mismatch (CSRF), or on a malformed
 * callback. Always shuts the listener down before returning.
 */
export async function runLogin(options: LoginOptions = {}): Promise<LoginResult> {
  const timeoutMs = options.timeoutMs ?? readTimeoutFromEnv() ?? DEFAULT_TIMEOUT_MS;
  const shouldOpenBrowser = options.openBrowser ?? process.env.TETIVA_NO_BROWSER !== "1";
  const cliToken = randomBytes(32).toString("hex");

  const { server, port, captured } = await startListener(cliToken);
  try {
    const callback = `http://127.0.0.1:${port}/`;
    const authUrl = buildAuthUrl(callback, cliToken);

    console.log("Opening browser to sign in to Tetiva…");
    console.log(`If the browser doesn't open, visit:\n  ${authUrl}`);

    if (shouldOpenBrowser) {
      // `open` rejects when a default browser can't be launched (headless
      // boxes, SSH sessions). The URL is already printed above so the user
      // can copy/paste; swallow the launcher error.
      try {
        await open(authUrl);
      } catch {
        // intentional — fall back to the printed URL.
      }
    }

    const apiToken = await raceWithTimeout(captured, timeoutMs);
    await saveCredentials({ token: apiToken });
    return { credentialsPath: credentialsPath() };
  } finally {
    server.close();
  }
}

/** Read the test-hook timeout override; returns `null` if absent/invalid. */
function readTimeoutFromEnv(): number | null {
  const raw = process.env.TETIVA_LOGIN_TIMEOUT_MS;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Compose the browser-redirect URL. Separate so the test suite can assert it. */
export function buildAuthUrl(callback: string, cliToken: string): string {
  const base = resolveApiUrl();
  const params = new URLSearchParams({ cli_token: cliToken, callback });
  return `${base}/auth/cli-login?${params.toString()}`;
}

interface ListenerHandle {
  server: Server;
  port: number;
  /** Resolves with the `api_token` once a valid callback arrives. */
  captured: Promise<string>;
}

/**
 * Bind the localhost listener and return the captured-token promise. The
 * handler closes over `expectedCliToken` so the CSRF check happens inline.
 */
async function startListener(expectedCliToken: string): Promise<ListenerHandle> {
  let resolveCaptured!: (token: string) => void;
  let rejectCaptured!: (error: Error) => void;
  const captured = new Promise<string>((resolve, reject) => {
    resolveCaptured = resolve;
    rejectCaptured = reject;
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, expectedCliToken, {
      resolve: (token) => resolveCaptured(token),
      reject: (error) => rejectCaptured(error),
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });

  const port = (server.address() as AddressInfo).port;
  return { server, port, captured };
}

/**
 * Handle a callback request. Validates the CSRF `cli_token`, extracts
 * `api_token`, responds with the success or failure page, and settles the
 * promise. Route-blind: any path is treated as the callback (the listener
 * only serves one request).
 */
function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedCliToken: string,
  settle: { resolve: (token: string) => void; reject: (error: Error) => void },
): void {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const parsed = CliLoginCallbackQuery.safeParse({
    cli_token: url.searchParams.get("cli_token") ?? "",
    api_token: url.searchParams.get("api_token") ?? "",
  });
  if (!parsed.success) {
    respondFailure(res, "Missing cli_token or api_token in the callback.");
    settle.reject(new Error("Backend callback was missing cli_token or api_token."));
    return;
  }
  if (!timingSafeEquals(parsed.data.cli_token, expectedCliToken)) {
    respondFailure(res, "Sign-in token mismatch. Try `tetiva login` again.");
    settle.reject(new Error("cli_token in callback did not match the value the CLI issued."));
    return;
  }
  respondSuccess(res);
  settle.resolve(parsed.data.api_token);
}

function respondSuccess(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(SUCCESS_HTML);
}

function respondFailure(res: ServerResponse, message: string): void {
  res.statusCode = 400;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(failureHtml(message));
}

function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Login timed out (no callback within 5 minutes)."));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
