/**
 * `tetiva.config.json` schema, validation, and emission.
 *
 * The schema is owned by this repo and Zod-validated at every command's
 * entry (per `CLAUDE.md` §7). Versioned via the top-level `version` field;
 * never bypass validation when reading or writing (avoids config drift
 * across CLI versions).
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const CONFIG_FILENAME = "tetiva.config.json";

/**
 * Production backend host. Override via `TETIVA_API_URL` for local dev — the
 * single owner of the default lives here so the override stays one env var and
 * one constant, not a scatter of literals (per TVA-24 launch prompt).
 */
export const DEFAULT_API_URL = "https://api.tetiva.dev";

/**
 * Resolve the backend base URL. `TETIVA_API_URL` wins when set and non-empty;
 * otherwise the production default. Trailing slashes are trimmed so callers can
 * compose paths with a leading `/` without producing a double-slash.
 */
export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.TETIVA_API_URL?.trim();
  const url = override && override.length > 0 ? override : DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

/** Supported file-format identifiers — same set as the format detectors. */
export const FORMAT_IDS = ["i18next", "arb", "strings", "android", "properties"] as const;

export const configSchema = z.object({
  version: z.literal(1),
  format: z.enum(FORMAT_IDS),
  sourceLocale: z.string().min(1),
  targetLocales: z.array(z.string().min(1)),
  globs: z.object({
    source: z.array(z.string()),
    targets: z.array(z.string()),
  }),
});

export type TetivaConfig = z.infer<typeof configSchema>;

/**
 * Validate and serialize a config to its on-disk string form:
 * 2-space indent, LF line endings, single trailing newline.
 */
export function serializeConfig(config: TetivaConfig): string {
  const validated = configSchema.parse(config);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

/** Validate `config` and write it to `tetiva.config.json` at `root`. */
export async function writeConfig(root: string, config: TetivaConfig): Promise<string> {
  const target = join(root, CONFIG_FILENAME);
  // `writeFile` emits the string bytes verbatim, so the LF endings produced
  // by `serializeConfig` survive on Windows too (no `\r\n` translation).
  await writeFile(target, serializeConfig(config), "utf8");
  return target;
}
