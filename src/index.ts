/**
 * Tetiva CLI entry point.
 *
 * TVA-21 scaffold: a stub that prints the version and exits 0.
 * Real command parsing and subcommands land in later issues (TVA-22+).
 * For now this only proves the binary runs.
 */

export const VERSION = "0.0.0";

export function run(): void {
  console.log(`tetiva v${VERSION}`);
}
