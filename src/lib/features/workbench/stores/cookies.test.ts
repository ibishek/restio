import { describe, expect, it } from "vitest";
import { makeRequest, normalizeRequest } from "./types";
import type { Cookie, HttpRequest } from "#lib/types";

describe("Cookie Jar and Session Persistence Store", () => {
  it("defaults new requests with useCookieJar enabled", () => {
    const req = makeRequest("Test Req", "GET", "https://api.example.com");
    expect(req.useCookieJar).toBe(true);
  });

  it("normalizes legacy requests without useCookieJar to true", () => {
    const legacy = makeRequest("Legacy", "POST", "https://api.example.com");
    delete (legacy as Partial<HttpRequest>).useCookieJar;
    const normalized = normalizeRequest(legacy);
    expect(normalized.useCookieJar).toBe(true);
  });

  it("preserves explicit useCookieJar = false setting", () => {
    const stateless = makeRequest("Stateless", "GET", "https://api.example.com");
    stateless.useCookieJar = false;
    const normalized = normalizeRequest(stateless);
    expect(normalized.useCookieJar).toBe(false);
  });

  it("supports full cookie attributes model", () => {
    const cookie: Cookie = {
      id: "ck-12345",
      workspaceId: "ws-test",
      domain: "api.example.com",
      path: "/v1",
      name: "session_token",
      value: "secret_xyz",
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      expires: 1780000000,
      maxAge: 3600,
      createdAt: 1770000000,
    };

    expect(cookie.name).toBe("session_token");
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
  });
});
