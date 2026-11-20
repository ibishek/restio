import { describe, it, expect } from "vitest";
import { parseSingleTiming, parseServerTiming, summarizeServerTiming } from "./serverTiming";

describe("serverTiming utils", () => {
  describe("parseSingleTiming", () => {
    it("parses metric with duration", () => {
      const res = parseSingleTiming("db;dur=53.2");
      expect(res).toEqual({
        name: "db",
        duration: 53.2,
        description: undefined,
        isFlag: false,
      });
    });

    it("parses metric with duration and quoted description", () => {
      const res = parseSingleTiming('db;dur=120.5;desc="PostgreSQL Query"');
      expect(res).toEqual({
        name: "db",
        duration: 120.5,
        description: "PostgreSQL Query",
        isFlag: false,
      });
    });

    it("parses metric with description before duration", () => {
      const res = parseSingleTiming('app;desc="Main handler";dur=34.1');
      expect(res).toEqual({
        name: "app",
        duration: 34.1,
        description: "Main handler",
        isFlag: false,
      });
    });

    it("parses flag metric with no duration", () => {
      const res = parseSingleTiming("cache-miss");
      expect(res).toEqual({
        name: "cache-miss",
        duration: undefined,
        description: undefined,
        isFlag: true,
      });
    });

    it("parses flag metric with description only", () => {
      const res = parseSingleTiming('cache;desc="Cache Miss"');
      expect(res).toEqual({
        name: "cache",
        duration: undefined,
        description: "Cache Miss",
        isFlag: true,
      });
    });
  });

  describe("parseServerTiming", () => {
    it("parses multiple comma-separated metrics", () => {
      const header = 'cache;dur=12.4;desc="Redis", db;dur=65.2;desc="Postgres", miss';
      const metrics = parseServerTiming(header);

      expect(metrics).toHaveLength(3);
      expect(metrics[0]).toEqual({
        name: "cache",
        duration: 12.4,
        description: "Redis",
        isFlag: false,
      });
      expect(metrics[1]).toEqual({
        name: "db",
        duration: 65.2,
        description: "Postgres",
        isFlag: false,
      });
      expect(metrics[2]).toEqual({
        name: "miss",
        duration: undefined,
        description: undefined,
        isFlag: true,
      });
    });

    it("handles commas inside quoted descriptions correctly", () => {
      const header = 'sql;desc="SELECT id, name FROM users";dur=45.2, app;dur=10';
      const metrics = parseServerTiming(header);

      expect(metrics).toHaveLength(2);
      expect(metrics[0].description).toBe("SELECT id, name FROM users");
      expect(metrics[0].duration).toBe(45.2);
      expect(metrics[1].name).toBe("app");
      expect(metrics[1].duration).toBe(10);
    });

    it("handles multiple header lines as an array", () => {
      const headers = ["db;dur=50", "render;dur=30"];
      const metrics = parseServerTiming(headers);

      expect(metrics).toHaveLength(2);
      expect(metrics[0].duration).toBe(50);
      expect(metrics[1].duration).toBe(30);
    });

    it("returns empty array on empty or undefined input", () => {
      expect(parseServerTiming(undefined)).toEqual([]);
      expect(parseServerTiming("")).toEqual([]);
      expect(parseServerTiming("   ")).toEqual([]);
    });
  });

  describe("summarizeServerTiming", () => {
    it("calculates total server time and network overhead", () => {
      const headers = {
        "Server-Timing": "db;dur=80, app;dur=40",
      };
      const summary = summarizeServerTiming(headers, 200);

      expect(summary.hasTimings).toBe(true);
      expect(summary.totalServerDurationMs).toBe(120);
      expect(summary.clientRoundTripMs).toBe(200);
      expect(summary.networkLatencyMs).toBe(80);
      expect(summary.metrics).toHaveLength(2);
    });

    it("handles case-insensitive header lookup", () => {
      const headers = {
        "server-timing": "cache;dur=15",
      };
      const summary = summarizeServerTiming(headers, 50);

      expect(summary.hasTimings).toBe(true);
      expect(summary.totalServerDurationMs).toBe(15);
      expect(summary.networkLatencyMs).toBe(35);
    });

    it("handles response without server-timing header", () => {
      const headers = {
        "content-type": "application/json",
      };
      const summary = summarizeServerTiming(headers, 120);

      expect(summary.hasTimings).toBe(false);
      expect(summary.totalServerDurationMs).toBe(0);
      expect(summary.clientRoundTripMs).toBe(120);
      expect(summary.networkLatencyMs).toBe(120);
      expect(summary.metrics).toHaveLength(0);
    });

    it("clamps network latency to 0 if server duration exceeds client round-trip", () => {
      // Occurs if server clock / client clock variance or parallel operations
      const headers = {
        "Server-Timing": "worker1;dur=100, worker2;dur=100",
      };
      const summary = summarizeServerTiming(headers, 120);

      expect(summary.totalServerDurationMs).toBe(200);
      expect(summary.networkLatencyMs).toBe(0);
    });
  });
});
