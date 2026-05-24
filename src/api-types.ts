/**
 * Backend HTTP API contract — vendored per ADR-0004 / CLAUDE.md §7.
 *
 * Vendoring discipline: the top of each schema block names its origin in
 * `backend/src/api/schemas.ts` and pins the SHA. The block currently empty —
 * TVA-23 will vendor the projects/files/jobs/billing surfaces when it lands.
 *
 * LOCAL DRAFT — pending backend implementation. Move to vendored-from-backend
 * on next CLI release.
 *
 * Backend has no `cli-login` schemas at TVA-24 time (confirmed by reading
 * backend/src/api/schemas.ts). The shapes below are the CLI side of the
 * contract proposed in this PR's description; once the backend follow-up issue
 * lands, replace this block with a `// VENDORED FROM backend/src/api/schemas.ts
 * @ <sha>` block.
 */

import { z } from "zod";

/**
 * The callback URL the backend redirects to once the user has authenticated in
 * the browser. Carries two query params:
 *
 * - `cli_token` — the same opaque nonce the CLI emitted when opening the
 *   browser. Used as a CSRF check: the listener rejects responses that don't
 *   match.
 * - `api_token` — the long-lived bearer token the CLI persists to
 *   `~/.tetiva/credentials`. Treated as opaque bytes — never parsed, never
 *   logged.
 *
 * Validated leniently (both are non-empty strings) — the contract is whatever
 * the backend emits, and we surface specific errors above the schema layer
 * when one is missing.
 */
export const CliLoginCallbackQuery = z.object({
  cli_token: z.string().min(1),
  api_token: z.string().min(1),
});
export type CliLoginCallbackQueryT = z.infer<typeof CliLoginCallbackQuery>;
