/**
 * `tetiva init` — detect the project's i18n format and locales, then emit
 * `tetiva.config.json` at the project root.
 *
 * Fully local: no network, no auth, no token storage (those land in later
 * issues). Detection is path-based only.
 */

import { stat } from "node:fs/promises";
import { join } from "node:path";
import { checkbox, confirm, select } from "@inquirer/prompts";
import { CONFIG_FILENAME, type TetivaConfig, writeConfig } from "../config.js";
import { type FormatDetection, detectFormat } from "../format/detect.js";
import { CANONICAL_LOCALES, type CanonicalLocale, mostFrequentLocale } from "../locale/detect.js";

export interface InitOptions {
  /** Skip prompts and overwrite an existing config: `--yes` / `-y`. */
  yes: boolean;
  /** Project root to operate on. Defaults to the current working directory. */
  root?: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Build the source/target glob lists from the detected files. */
function buildGlobs(
  detection: FormatDetection,
  source: CanonicalLocale,
  targets: CanonicalLocale[],
): TetivaConfig["globs"] {
  const targetSet = new Set<string>(targets);
  const sourceGlobs = new Set<string>();
  const targetGlobs = new Set<string>();

  for (const file of detection.files) {
    // Locale-default files (e.g. Android `values/`) belong to the source.
    if (file.locale === source || file.locale === null) {
      sourceGlobs.add(file.path);
    } else if (targetSet.has(file.locale)) {
      targetGlobs.add(file.path);
    }
  }

  return {
    source: [...sourceGlobs].sort(),
    targets: [...targetGlobs].sort(),
  };
}

/**
 * Run the init flow. Returns the absolute path of the written config, or
 * `null` if the user declined to overwrite an existing one.
 */
export async function runInit(options: InitOptions): Promise<string | null> {
  const root = options.root ?? process.cwd();
  const configPath = join(root, CONFIG_FILENAME);

  if (await fileExists(configPath)) {
    if (!options.yes) {
      const overwrite = await confirm({
        message: `${CONFIG_FILENAME} already exists. Overwrite it?`,
        default: false,
      });
      if (!overwrite) {
        console.log(`Keeping the existing ${CONFIG_FILENAME}. Nothing changed.`);
        return null;
      }
    }
    // With --yes, overwrite silently.
  }

  const detection = await detectFormat(root);
  if (!detection || detection.locales.length === 0) {
    throw new Error(
      "Could not detect a supported i18n format with recognized locales in this directory.\n" +
        "Supported formats: i18next (.json), ARB (.arb), Apple Strings (.strings), " +
        "Android XML (strings.xml), Java Properties (.properties).",
    );
  }

  const occurrences = detection.files
    .map((file) => file.locale)
    .filter((locale): locale is CanonicalLocale => locale !== null);
  const sourceDefault = mostFrequentLocale(occurrences);
  const detected = detection.locales;

  let source: CanonicalLocale;
  let targets: CanonicalLocale[];

  if (options.yes) {
    source = sourceDefault;
    targets = detected.filter((locale) => locale !== source);
  } else {
    console.log(`Detected format: ${detection.format}`);
    console.log(`Detected locales: ${detected.join(", ")}`);

    source = await select<CanonicalLocale>({
      message: "Source locale (the locale your code is authored in):",
      choices: detected.map((locale) => ({ name: locale, value: locale })),
      default: sourceDefault,
    });

    const detectedTargets = detected.filter((locale) => locale !== source);
    targets = await checkbox<CanonicalLocale>({
      message: "Target locales to translate into:",
      choices: CANONICAL_LOCALES.filter((locale) => locale !== source).map((locale) => ({
        name: locale,
        value: locale,
        checked: detectedTargets.includes(locale),
      })),
    });
  }

  const config: TetivaConfig = {
    version: 1,
    format: detection.format,
    sourceLocale: source,
    targetLocales: [...targets].sort(),
    globs: buildGlobs(detection, source, targets),
  };

  const written = await writeConfig(root, config);
  console.log(`Wrote ${CONFIG_FILENAME}`);
  console.log(`  format:        ${config.format}`);
  console.log(`  sourceLocale:  ${config.sourceLocale}`);
  console.log(`  targetLocales: ${config.targetLocales.join(", ") || "(none)"}`);
  return written;
}
