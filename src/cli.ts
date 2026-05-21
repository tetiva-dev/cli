/**
 * Commander program for the Tetiva CLI.
 *
 * `bin.ts` imports {@link main}. `index.ts` keeps the legacy `VERSION` /
 * `run()` exports from the TVA-21 scaffold; this module composes on top of
 * them rather than replacing them.
 *
 * `tetiva --version` prints `tetiva v<version>` (the TVA-21 contract);
 * `tetiva init` runs the init flow; bare `tetiva` prints help.
 */

import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { VERSION } from "./index.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("tetiva")
    .description("Tetiva CLI — push your i18n files, get them translated, pull them back.")
    .version(`tetiva v${VERSION}`, "-V, --version", "Print the version and exit");

  program
    .command("init")
    .description("Detect your i18n format and locales, then write tetiva.config.json")
    .option("-y, --yes", "Accept detected defaults and overwrite an existing config")
    .action(async (options: { yes?: boolean }) => {
      await runInit({ yes: options.yes ?? false });
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}
