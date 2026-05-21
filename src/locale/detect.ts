/**
 * Locale detection + normalization for `tetiva init`.
 *
 * The v1.0 recognized set is small and inline (RU, EN, KZ in both scripts,
 * UZ in both scripts, TR) — per `CLAUDE.md` §3 and §11 this is NOT yet
 * reference data. When this grows into full BCP 47 validation, the table
 * becomes reference data and moves behind an authorized task.
 *
 * Canonical output is IETF BCP 47 with hyphens (never the `_` separator
 * form): `en`, `ru`, `kk-Cyrl`, `kk-Latn`, `uz-Latn`, `uz-Cyrl`, `tr`.
 */

/** Canonical BCP 47 tags recognized for v1.0. */
export type CanonicalLocale = "en" | "ru" | "tr" | "kk-Cyrl" | "kk-Latn" | "uz-Latn" | "uz-Cyrl";

/** Every canonical locale recognized for v1.0, in display order. */
export const CANONICAL_LOCALES: CanonicalLocale[] = [
  "en",
  "ru",
  "tr",
  "kk-Cyrl",
  "kk-Latn",
  "uz-Latn",
  "uz-Cyrl",
];

const SCRIPT_RE = /^[a-z]{4}$/i;
const REGION_RE = /^([a-z]{2}|\d{3})$/i;

/** Title-case a 4-letter script subtag: `cyrl` -> `Cyrl`. */
function normalizeScript(subtag: string): string {
  return subtag[0].toUpperCase() + subtag.slice(1).toLowerCase();
}

/**
 * Normalize a raw locale candidate (extracted from a file or directory
 * name) to a canonical BCP 47 tag, or `null` if it is not a recognized
 * v1.0 locale.
 *
 * The candidate must use the hyphen subtag separator. A candidate carrying
 * the `_` separator form is rejected at this boundary — BCP 47 mandates
 * hyphens, and accepting both would let non-canonical tags leak into the
 * emitted config.
 */
export function normalizeLocale(raw: string): CanonicalLocale | null {
  if (!raw) return null;
  // Reject the `_` separator form outright — only hyphenated subtags pass.
  if (raw.includes("_")) return null;

  const subtags = raw.split("-").filter(Boolean);
  if (subtags.length === 0) return null;

  const language = subtags[0].toLowerCase();
  let script: string | undefined;

  for (const subtag of subtags.slice(1)) {
    if (SCRIPT_RE.test(subtag)) {
      script = normalizeScript(subtag);
    } else if (REGION_RE.test(subtag)) {
      // Region subtags carry no meaning for the v1.0 allowlist — drop them.
    } else {
      // Anything else (variants, extensions) is out of scope for v1.0.
      return null;
    }
  }

  switch (language) {
    case "en":
      return script ? null : "en";
    case "ru":
      return script ? null : "ru";
    case "tr":
      return script ? null : "tr";
    // `kk` (Kazakh) is canonical; `kz` is a common filename alias for the
    // KZ country code — accept both, default to Cyrillic when no script.
    case "kk":
    case "kz":
      if (script === "Latn") return "kk-Latn";
      if (script === "Cyrl" || script === undefined) return "kk-Cyrl";
      return null;
    // Uzbek's official script is Latin — default to it when none is given.
    case "uz":
      if (script === "Cyrl") return "uz-Cyrl";
      if (script === "Latn" || script === undefined) return "uz-Latn";
      return null;
    default:
      return null;
  }
}

/** True if `raw` normalizes to a recognized v1.0 locale. */
export function isRecognizedLocale(raw: string): boolean {
  return normalizeLocale(raw) !== null;
}

/**
 * Pick the most-frequent locale from a list of detected occurrences.
 * Returns the unique modal locale; on a tie (or empty input) prefers `en`
 * when present, else the alphabetically-first detected locale, else `en`.
 * This is the preselected source-locale default for the init prompt.
 */
export function mostFrequentLocale(locales: CanonicalLocale[]): CanonicalLocale {
  if (locales.length === 0) return "en";

  const counts = new Map<CanonicalLocale, number>();
  for (const locale of locales) {
    counts.set(locale, (counts.get(locale) ?? 0) + 1);
  }

  let max = 0;
  for (const count of counts.values()) {
    if (count > max) max = count;
  }
  const atMax = [...counts.entries()]
    .filter(([, count]) => count === max)
    .map(([locale]) => locale);

  if (atMax.length === 1) return atMax[0];
  if (atMax.includes("en")) return "en";
  return [...atMax].sort()[0];
}
