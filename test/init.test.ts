import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(here, "../dist/bin.js");
const fixturesDir = resolve(here, "fixtures");

interface Expected {
  fixture: string;
  format: string;
  sourceLocale: string;
  targetLocales: string[];
}

const cases: Expected[] = [
  { fixture: "i18next-basic", format: "i18next", sourceLocale: "en", targetLocales: ["ru"] },
  { fixture: "arb-basic", format: "arb", sourceLocale: "en", targetLocales: ["ru"] },
  { fixture: "strings-basic", format: "strings", sourceLocale: "en", targetLocales: ["ru"] },
];

/** Copy a fixture into a fresh tmp dir so the source fixtures are never mutated. */
function stageFixture(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `tetiva-init-${fixture}-`));
  cpSync(join(fixturesDir, fixture), dir, { recursive: true });
  return dir;
}

describe("tetiva init", () => {
  const staged: string[] = [];

  beforeAll(() => {
    // The binary must be built first (same contract as the smoke test).
    for (const { fixture } of cases) {
      staged.push(stageFixture(fixture));
    }
  });

  afterAll(() => {
    for (const dir of staged) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const [index, expected] of cases.entries()) {
    it(`detects ${expected.format} and emits a config for ${expected.fixture}`, () => {
      const dir = staged[index];
      execFileSync("node", [binPath, "init", "--yes"], { cwd: dir, encoding: "utf8" });

      const raw = readFileSync(join(dir, "tetiva.config.json"), "utf8");
      // 2-space indent, LF line endings, trailing newline.
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.includes("\r\n")).toBe(false);
      expect(raw).toContain('\n  "version": 1');

      const config = JSON.parse(raw);
      expect(config.version).toBe(1);
      expect(config.format).toBe(expected.format);
      expect(config.sourceLocale).toBe(expected.sourceLocale);
      expect(config.targetLocales).toEqual(expected.targetLocales);
      expect(Array.isArray(config.globs.source)).toBe(true);
      expect(Array.isArray(config.globs.targets)).toBe(true);
      expect(config.globs.source.length).toBeGreaterThan(0);
      expect(config.globs.targets.length).toBeGreaterThan(0);
    });
  }

  it("is idempotent with --yes (overwrites silently, same output)", () => {
    const dir = staged[0];
    execFileSync("node", [binPath, "init", "--yes"], { cwd: dir, encoding: "utf8" });
    const config = JSON.parse(readFileSync(join(dir, "tetiva.config.json"), "utf8"));
    expect(config.format).toBe("i18next");
    expect(config.sourceLocale).toBe("en");
    expect(config.targetLocales).toEqual(["ru"]);
  });
});
