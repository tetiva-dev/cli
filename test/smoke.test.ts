import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(here, "../dist/bin.js");

describe("tetiva cli smoke", () => {
  it("prints the version and exits 0", () => {
    const stdout = execFileSync("node", [binPath], { encoding: "utf8" });
    expect(stdout.trim()).toBe("tetiva v0.0.0");
  });
});
