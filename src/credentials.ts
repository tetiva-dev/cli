/**
 * Tetiva CLI credentials storage — the only persistent CLI state besides
 * `tetiva.config.json` (CLAUDE.md §5 runtime model). Security perimeter
 * (CLAUDE.md §11; auto-merge guardrail 12) — diff here requires founder
 * review.
 *
 * On-disk format is platform-conditional:
 *
 * - POSIX: `~/.tetiva/credentials` — the token as a single line of UTF-8
 *   bytes, no trailing newline. File mode `0600` (owner read/write only),
 *   enforced by an explicit `chmod` after write because Node's `writeFile`
 *   `mode` arg is masked by the process umask.
 * - Windows: `%APPDATA%/tetiva/credentials.json` — `{"token":"..."}`. No file
 *   permissions API on Windows; the user-profile directory's ACL is the
 *   effective gate. DPAPI / Credential Manager is post-v1.0 (out of scope
 *   per the TVA-24 launch prompt).
 *
 * The token is treated as opaque bytes — never parsed, never logged (not even
 * masked). Per CLAUDE.md §11 operational footguns.
 *
 * `TETIVA_HOME` overrides the home-directory root for test isolation only.
 * The override is read at call time so each test can scope it independently.
 */

import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Credentials {
  /** Long-lived API token. Opaque; do not parse, do not log. */
  token: string;
}

/** A few callers want to surface the absolute path (e.g. login's success line). */
export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === "win32") {
    // %APPDATA% is always set in real Windows shells; fall back to the user
    // profile if a stripped env strips it (test runners, locked-down CI).
    const appData = env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appData, "tetiva", "credentials.json");
  }
  // POSIX. `TETIVA_HOME` is a test-only escape hatch.
  const root = env.TETIVA_HOME ?? homedir();
  return join(root, ".tetiva", "credentials");
}

/**
 * Read the credentials file. Returns `null` if absent — callers distinguish
 * "no credentials" from "credentials malformed" so a manual edit doesn't
 * silently pass for a logged-out state.
 */
export async function loadCredentials(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Credentials | null> {
  const path = credentialsPath(env);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  if (process.platform === "win32") {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { token?: unknown }).token !== "string"
    ) {
      throw new Error(`${path}: malformed credentials file (expected {"token": "..."})`);
    }
    return { token: (parsed as { token: string }).token };
  }
  const token = raw.trim();
  if (token.length === 0) {
    throw new Error(`${path}: malformed credentials file (empty)`);
  }
  return { token };
}

/**
 * Persist credentials. Creates the parent directory if needed (`0700` on
 * POSIX so the directory itself can't be world-listed). On POSIX the file is
 * `chmod`ed to `0600` after write — the `mode` arg to `writeFile` alone is
 * insufficient because the process umask masks it.
 */
export async function saveCredentials(
  credentials: Credentials,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = credentialsPath(env);
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  if (process.platform === "win32") {
    const body = `${JSON.stringify({ token: credentials.token })}\n`;
    await writeFile(path, body, "utf8");
    return;
  }
  await writeFile(path, credentials.token, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

/**
 * Remove the credentials file. Idempotent — no error if it doesn't exist
 * (logging out twice is not a failure). Does not remove the parent directory
 * (it may still hold tooling state we don't own).
 */
export async function clearCredentials(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = credentialsPath(env);
  await rm(path, { force: true });
}

/**
 * Test helper: return the file mode as a number (e.g. `0o600`). Returns `null`
 * if the file doesn't exist. Lives here rather than in the test so test code
 * doesn't reach into `node:fs` to verify the perimeter's invariant.
 */
export async function credentialsMode(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number | null> {
  const path = credentialsPath(env);
  try {
    const s = await stat(path);
    return s.mode & 0o777;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
