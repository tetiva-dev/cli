/**
 * File-format detection for `tetiva init`.
 *
 * Detection is by file extension and directory layout ONLY — no file
 * content is parsed (per the TVA-22 scope). Each detector extracts a raw
 * locale candidate from the path and hands it to {@link normalizeLocale};
 * only candidates that resolve to a recognized v1.0 locale count.
 *
 * Supported formats (same set as backend, in lock-step per `CLAUDE.md` §3):
 *   - i18next   — locale-named `*.json` or `<locale>/translation.json`
 *   - arb       — `app_<locale>.arb`
 *   - strings   — `<locale>.lproj/Localizable.strings` (Apple)
 *   - android   — `res/values-<locale>/strings.xml` (XML)
 *   - properties— `messages_<locale>.properties` (Java)
 */

import fg from "fast-glob";
import { type CanonicalLocale, normalizeLocale } from "../locale/detect.js";

export type FormatId = "i18next" | "arb" | "strings" | "android" | "properties";

/** A single localized file discovered during detection. */
export interface DetectedFile {
  /** Path relative to the project root, POSIX-separated. */
  path: string;
  /** Recognized locale, or `null` for a locale-default file (Android `values/`). */
  locale: CanonicalLocale | null;
}

export interface FormatDetection {
  format: FormatId;
  /** All discovered files for the winning format. */
  files: DetectedFile[];
  /** Sorted, de-duplicated recognized locales (excludes locale-default files). */
  locales: CanonicalLocale[];
}

/**
 * Tie-break order when more than one format has the same number of
 * recognized-locale files. Most-common UI-localization formats first.
 */
const FORMAT_PRIORITY: FormatId[] = ["i18next", "arb", "strings", "android", "properties"];

const IGNORE = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

function stripExt(file: string, ext: string): string {
  return file.slice(0, file.length - ext.length);
}

function basename(relPath: string): string {
  const parts = relPath.split("/");
  return parts[parts.length - 1];
}

function parentDir(relPath: string): string | undefined {
  const parts = relPath.split("/");
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/** i18next: `en.json` (locale-named) or `<locale>/translation.json`. */
function i18nextLocale(relPath: string): CanonicalLocale | null {
  const base = stripExt(basename(relPath), ".json");
  const direct = normalizeLocale(base);
  if (direct) return direct;
  const parent = parentDir(relPath);
  return parent ? normalizeLocale(parent) : null;
}

/** ARB: `app_<locale>.arb`, `<name>-<locale>.arb`, or bare `<locale>.arb`. */
function arbLocale(relPath: string): CanonicalLocale | null {
  const base = stripExt(basename(relPath), ".arb");
  const candidates = [base];
  if (base.includes("_")) candidates.push(base.slice(base.lastIndexOf("_") + 1));
  if (base.includes("-")) candidates.push(base.slice(base.lastIndexOf("-") + 1));
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return null;
}

/** Apple Strings: locale comes from the enclosing `<locale>.lproj` directory. */
function stringsLocale(relPath: string): CanonicalLocale | null {
  const parent = parentDir(relPath);
  if (!parent || !parent.endsWith(".lproj")) return null;
  return normalizeLocale(stripExt(parent, ".lproj"));
}

/**
 * Android: locale comes from the `values-<qualifier>` directory. A bare
 * `values/` directory is the locale-default config (returns `null`).
 * Handles the `-r<REGION>` region marker and the `b+lang+Script` form.
 */
function androidLocale(relPath: string): CanonicalLocale | null {
  const parent = parentDir(relPath);
  if (!parent) return null;
  if (parent === "values") return null;
  if (!parent.startsWith("values-")) return null;
  let qualifier = parent.slice("values-".length);
  if (qualifier.startsWith("b+")) qualifier = qualifier.slice(2).replace(/\+/g, "-");
  qualifier = qualifier.replace(/-r([A-Za-z]{2})\b/g, "");
  return normalizeLocale(qualifier);
}

/** Java Properties: `messages_<locale>.properties` (trailing locale token). */
function propertiesLocale(relPath: string): CanonicalLocale | null {
  const base = stripExt(basename(relPath), ".properties");
  const idx = base.lastIndexOf("_");
  if (idx === -1) return null;
  return normalizeLocale(base.slice(idx + 1));
}

interface Detector {
  format: FormatId;
  patterns: string[];
  /** Returns `undefined` if the path is not a file of this format at all. */
  localeOf: (relPath: string) => CanonicalLocale | null | undefined;
}

const DETECTORS: Detector[] = [
  { format: "i18next", patterns: ["**/*.json"], localeOf: i18nextLocale },
  { format: "arb", patterns: ["**/*.arb"], localeOf: arbLocale },
  { format: "strings", patterns: ["**/*.lproj/*.strings"], localeOf: stringsLocale },
  {
    format: "android",
    patterns: ["**/values/strings.xml", "**/values-*/strings.xml"],
    localeOf: (relPath) => {
      const parent = parentDir(relPath);
      if (!parent || (parent !== "values" && !parent.startsWith("values-"))) return undefined;
      return androidLocale(relPath);
    },
  },
  { format: "properties", patterns: ["**/*.properties"], localeOf: propertiesLocale },
];

function uniqueSortedLocales(files: DetectedFile[]): CanonicalLocale[] {
  const set = new Set<CanonicalLocale>();
  for (const file of files) {
    if (file.locale) set.add(file.locale);
  }
  return [...set].sort();
}

/**
 * Scan `root` and return the detected format with the strongest signal
 * (most files resolving to a recognized locale), or `null` if no supported
 * localized files are found. On a tie, {@link FORMAT_PRIORITY} decides.
 */
export async function detectFormat(root: string): Promise<FormatDetection | null> {
  const matches: FormatDetection[] = [];

  for (const detector of DETECTORS) {
    const entries = await fg(detector.patterns, {
      cwd: root,
      ignore: IGNORE,
      onlyFiles: true,
      dot: false,
    });

    const files: DetectedFile[] = [];
    for (const relPath of entries.sort()) {
      const locale = detector.localeOf(relPath);
      if (locale === undefined) continue;
      // For i18next, only count files that map to a locale — a project's
      // `package.json` / `tetiva.config.json` must not register as a format.
      if (detector.format === "i18next" && locale === null) continue;
      files.push({ path: relPath, locale });
    }

    if (files.length > 0) {
      matches.push({ format: detector.format, files, locales: uniqueSortedLocales(files) });
    }
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const localeCountDelta = b.locales.length - a.locales.length;
    if (localeCountDelta !== 0) return localeCountDelta;
    const fileCountDelta = b.files.length - a.files.length;
    if (fileCountDelta !== 0) return fileCountDelta;
    return FORMAT_PRIORITY.indexOf(a.format) - FORMAT_PRIORITY.indexOf(b.format);
  });

  return matches[0];
}
