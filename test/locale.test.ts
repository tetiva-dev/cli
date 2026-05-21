import { describe, expect, it } from "vitest";
import { mostFrequentLocale, normalizeLocale } from "../src/locale/detect";

describe("normalizeLocale", () => {
  it("passes simple recognized languages through", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("RU")).toBe("ru");
    expect(normalizeLocale("tr")).toBe("tr");
  });

  it("drops region subtags not in the v1.0 allowlist", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("ru-RU")).toBe("ru");
  });

  it("defaults Kazakh to Cyrillic and Uzbek to Latin when no script is given", () => {
    expect(normalizeLocale("kk")).toBe("kk-Cyrl");
    expect(normalizeLocale("kz")).toBe("kk-Cyrl");
    expect(normalizeLocale("uz")).toBe("uz-Latn");
  });

  it("honours explicit script subtags", () => {
    expect(normalizeLocale("kk-Latn")).toBe("kk-Latn");
    expect(normalizeLocale("kk-cyrl")).toBe("kk-Cyrl");
    expect(normalizeLocale("uz-Cyrl")).toBe("uz-Cyrl");
    expect(normalizeLocale("kk-Cyrl-KZ")).toBe("kk-Cyrl");
  });

  it("rejects the `_` separator form at the boundary", () => {
    expect(normalizeLocale("en_US")).toBeNull();
    expect(normalizeLocale("kk_Cyrl")).toBeNull();
  });

  it("rejects unrecognized and malformed tags", () => {
    expect(normalizeLocale("")).toBeNull();
    expect(normalizeLocale("zz")).toBeNull();
    expect(normalizeLocale("de")).toBeNull();
    expect(normalizeLocale("en-Cyrl")).toBeNull();
  });
});

describe("mostFrequentLocale", () => {
  it("returns the unique modal locale", () => {
    expect(mostFrequentLocale(["ru", "ru", "en"])).toBe("ru");
  });

  it("prefers `en` on a tie", () => {
    expect(mostFrequentLocale(["en", "ru"])).toBe("en");
  });

  it("defaults to `en` on empty input", () => {
    expect(mostFrequentLocale([])).toBe("en");
  });
});
