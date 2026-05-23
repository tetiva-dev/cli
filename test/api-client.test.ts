import { describe, expect, it } from "vitest";
import { apiUrl, bearerHeader } from "../src/api-client.js";
import { DEFAULT_API_URL, resolveApiUrl } from "../src/config.js";

describe("resolveApiUrl", () => {
  it("returns the default when TETIVA_API_URL is unset", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(resolveApiUrl(env)).toBe(DEFAULT_API_URL);
  });

  it("returns the default when TETIVA_API_URL is empty or whitespace", () => {
    expect(resolveApiUrl({ TETIVA_API_URL: "" })).toBe(DEFAULT_API_URL);
    expect(resolveApiUrl({ TETIVA_API_URL: "   " })).toBe(DEFAULT_API_URL);
  });

  it("prefers TETIVA_API_URL when set (the Phase-1 local-dev hook)", () => {
    expect(resolveApiUrl({ TETIVA_API_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("strips trailing slashes so path joins don't double up", () => {
    expect(resolveApiUrl({ TETIVA_API_URL: "http://localhost:3000/" })).toBe(
      "http://localhost:3000",
    );
    expect(resolveApiUrl({ TETIVA_API_URL: "http://localhost:3000///" })).toBe(
      "http://localhost:3000",
    );
  });
});

describe("apiUrl", () => {
  it("joins a path onto the resolved base URL", () => {
    expect(apiUrl("/auth/cli-login", { TETIVA_API_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000/auth/cli-login",
    );
  });

  it("rejects a path without a leading slash (contract bug, not user error)", () => {
    expect(() => apiUrl("auth/cli-login")).toThrow(/must start with/);
  });
});

describe("bearerHeader", () => {
  it("composes the Authorization header value", () => {
    expect(bearerHeader("opaque-token")).toEqual({ Authorization: "Bearer opaque-token" });
  });
});
