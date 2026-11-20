import { describe, it, expect, beforeEach } from "vitest";
import { parseSemver, isNewerVersion, checkForUpdates, GITHUB_RELEASES_URL } from "./version";

const mockFetchNewer = (async () =>
  new Response("0.2.0\n", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })) as unknown as typeof fetch;

const mockFetchCurrent = (async () =>
  new Response("0.1.0\n", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  })) as unknown as typeof fetch;

const mockFetchError = (async () => {
  throw new Error("Network unreachable");
}) as unknown as typeof fetch;

const mockFetch404 = (async () =>
  new Response("Not Found", { status: 404 })) as unknown as typeof fetch;

describe("version utils", () => {
  describe("parseSemver", () => {
    it("parses standard semver strings", () => {
      expect(parseSemver("0.1.0")).toEqual({ major: 0, minor: 1, patch: 0, prerelease: undefined });
      expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
      expect(parseSemver("v2.10.5")).toEqual({
        major: 2,
        minor: 10,
        patch: 5,
        prerelease: undefined,
      });
    });

    it("parses prerelease tags", () => {
      expect(parseSemver("0.2.0-beta.1")).toEqual({
        major: 0,
        minor: 2,
        patch: 0,
        prerelease: "beta.1",
      });
    });

    it("returns null on invalid strings", () => {
      expect(parseSemver("")).toBeNull();
      expect(parseSemver("abc")).toBeNull();
      expect(parseSemver("1.2")).toBeNull();
      expect(parseSemver("1.2.3.4")).toBeNull();
    });
  });

  describe("isNewerVersion", () => {
    it("detects major bumps", () => {
      expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
      expect(isNewerVersion("0.9.9", "1.0.0")).toBe(false);
    });

    it("detects minor bumps", () => {
      expect(isNewerVersion("0.2.0", "0.1.9")).toBe(true);
      expect(isNewerVersion("0.1.9", "0.2.0")).toBe(false);
    });

    it("detects patch bumps", () => {
      expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
      expect(isNewerVersion("0.1.0", "0.1.1")).toBe(false);
    });

    it("handles equality", () => {
      expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
      expect(isNewerVersion("v0.1.0", "0.1.0")).toBe(false);
    });

    it("treats stable release as newer than prerelease of same version", () => {
      expect(isNewerVersion("0.2.0", "0.2.0-beta.1")).toBe(true);
    });
  });

  describe("checkForUpdates", () => {
    beforeEach(() => {
      if (typeof localStorage !== "undefined") {
        localStorage.clear();
      }
    });

    it("returns updateAvailable: true when remote is newer", async () => {
      const res = await checkForUpdates("0.1.0", {
        force: true,
        fetchFn: mockFetchNewer,
      });

      expect(res.updateAvailable).toBe(true);
      expect(res.latestVersion).toBe("0.2.0");
      expect(res.currentVersion).toBe("0.1.0");
      expect(res.releasesUrl).toBe(GITHUB_RELEASES_URL);
    });

    it("returns updateAvailable: false when current is up to date", async () => {
      const res = await checkForUpdates("0.1.0", {
        force: true,
        fetchFn: mockFetchCurrent,
      });

      expect(res.updateAvailable).toBe(false);
      expect(res.latestVersion).toBe("0.1.0");
    });

    it("handles network failure gracefully without throwing", async () => {
      const res = await checkForUpdates("0.1.0", {
        force: true,
        fetchFn: mockFetchError,
      });

      expect(res.updateAvailable).toBe(false);
      expect(res.latestVersion).toBeNull();
      expect(res.error).toContain("Network unreachable");
    });

    it("handles HTTP error response gracefully", async () => {
      const res = await checkForUpdates("0.1.0", {
        force: true,
        fetchFn: mockFetch404,
      });

      expect(res.updateAvailable).toBe(false);
      expect(res.latestVersion).toBeNull();
      expect(res.error).toBe("HTTP 404");
    });
  });
});
