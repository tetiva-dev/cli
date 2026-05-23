/**
 * `tetiva logout` — delete the credentials file. Idempotent: logging out when
 * already logged out is silent (per CLAUDE.md §11 operational footguns posture
 * — credentials handling should be predictable, not chatty).
 */

import { clearCredentials, credentialsPath, loadCredentials } from "../credentials.js";

export interface LogoutResult {
  /** True if a credentials file existed and was removed; false if already logged out. */
  removed: boolean;
}

export async function runLogout(): Promise<LogoutResult> {
  const existing = await loadCredentials().catch(() => null);
  await clearCredentials();
  if (existing === null) {
    console.log("Already signed out.");
    return { removed: false };
  }
  console.log(`Signed out (removed ${credentialsPath()}).`);
  return { removed: true };
}
