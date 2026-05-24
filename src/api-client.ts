/**
 * Tetiva backend HTTP client. Security perimeter (CLAUDE.md §11; auto-merge
 * guardrail 12) — diff here requires founder review.
 *
 * TVA-24 only needs the base-URL resolver and a Bearer-header constructor —
 * the cli-login flow itself runs in the browser, not over fetch. TVA-23 will
 * grow this module into a full request wrapper (push/pull/status). For now
 * the surface is intentionally narrow.
 *
 * Invariants:
 * - The token is never logged. Not in errors, not in debug output, not even
 *   masked. Per CLAUDE.md §11 operational footguns.
 * - Base URL resolution lives in `config.ts` so the `TETIVA_API_URL` override
 *   has one owner.
 */

import { resolveApiUrl } from "./config.js";

/** Build the `Authorization` header value for a given token. */
export function bearerHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Compose an absolute URL from a path against the resolved base URL. The path
 * is required to start with `/` so the join is unambiguous; this is a
 * contract bug (not a runtime user error) so we throw rather than coerce.
 */
export function apiUrl(path: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl: path must start with '/', got ${JSON.stringify(path)}`);
  }
  return `${resolveApiUrl(env)}${path}`;
}
