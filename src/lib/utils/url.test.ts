import { describe, expect, it } from "vitest";
import { composeUrl, isAbsoluteUrl } from "./url";

describe("url utils", () => {
  describe("isAbsoluteUrl", () => {
    it("detects http and https schemes", () => {
      expect(isAbsoluteUrl("https://api.example.com")).toBe(true);
      expect(isAbsoluteUrl("http://localhost:8080")).toBe(true);
      expect(isAbsoluteUrl("HTTP://UPPERCASE.COM")).toBe(true);
    });

    it("detects custom schemes", () => {
      expect(isAbsoluteUrl("grpc://service:50051")).toBe(true);
      expect(isAbsoluteUrl("ws://localhost:3000")).toBe(true);
    });

    it("rejects relative paths and variable placeholders", () => {
      expect(isAbsoluteUrl("/v1/users")).toBe(false);
      expect(isAbsoluteUrl("users/list")).toBe(false);
      expect(isAbsoluteUrl("{{base_url}}/users")).toBe(false);
      expect(isAbsoluteUrl("")).toBe(false);
    });
  });

  describe("composeUrl", () => {
    it("returns absolute path unchanged", () => {
      expect(composeUrl("https://base.com", ["/v1"], "https://override.com/api")).toBe(
        "https://override.com/api",
      );
    });

    it("composes base URL and prefixes with relative path", () => {
      expect(composeUrl("https://api.example.com", ["v1"], "users")).toBe(
        "https://api.example.com/v1/users",
      );
      expect(composeUrl("https://api.example.com/", ["/v1/"], "/users")).toBe(
        "https://api.example.com/v1/users",
      );
    });

    it("returns base URL when path is empty", () => {
      expect(composeUrl("https://api.example.com", [], "")).toBe("https://api.example.com");
      expect(composeUrl("https://api.example.com", ["v1"], "")).toBe("https://api.example.com/v1");
    });

    it("returns path when no base URL and no prefixes exist", () => {
      expect(composeUrl("", [], "/users")).toBe("/users");
      expect(composeUrl("", [], "")).toBe("");
    });

    it("preserves query and hash on trailing path segment", () => {
      expect(composeUrl("https://api.example.com", ["api"], "users?sort=asc#top")).toBe(
        "https://api.example.com/api/users?sort=asc#top",
      );
    });
  });
});
