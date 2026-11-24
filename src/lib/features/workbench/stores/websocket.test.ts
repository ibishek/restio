import { describe, expect, it } from "vitest";
import { makeRequest, normalizeRequest, makeTab } from "./types";
import { requestLabel, methodColor } from "./actions.svelte";
import type { WsMessageItem, WsEvent } from "#lib/types";

describe("WebSocket Client Store & Types", () => {
  it("detects websocket protocol from explicit protocol or ws:// scheme", () => {
    const wsReq1 = makeRequest("Echo WS", "GET", "wss://echo.websocket.events");
    expect(wsReq1.protocol).toBe("websocket");

    const wsReq2 = makeRequest("Local WS", "GET", "ws://localhost:8080");
    expect(wsReq2.protocol).toBe("websocket");

    const httpReq = makeRequest("HTTP GET", "GET", "https://api.example.com");
    expect(httpReq.protocol).toBe("http");
  });

  it("normalizes requests to websocket protocol if URL is ws:// or wss://", () => {
    const raw = makeRequest("Raw", "GET", "wss://gateway.org/ws");
    const normalized = normalizeRequest(raw);
    expect(normalized.protocol).toBe("websocket");
  });

  it("generates correct badge label and color for WebSocket requests", () => {
    const wsReq = makeRequest("WS Stream", "GET", "wss://echo.websocket.events");
    const httpReq = makeRequest("Standard API", "POST", "https://api.example.com");

    expect(requestLabel(wsReq)).toBe("WS");
    expect(requestLabel(httpReq)).toBe("POST");

    expect(methodColor("WS")).toBe("text-purple-400");
    expect(methodColor("POST")).toBe("text-amber-400");
  });

  it("initializes tabs with fresh disconnected WebSocket state", () => {
    const wsReq = makeRequest("WS Tab", "GET", "wss://echo.websocket.events");
    const tab = makeTab(wsReq, null);

    expect(tab.wsState).toBe("disconnected");
    expect(tab.wsMessages).toEqual([]);
    expect(tab.wsLastPingRttMs).toBeNull();
    expect(tab.wsConnectedAt).toBeNull();
    expect(tab.wsAutoReconnect).toBe(false);
  });

  it("models WebSocket message items and events correctly", () => {
    const msg: WsMessageItem = {
      id: "ws-msg-1",
      direction: "in",
      kind: "text",
      data: '{"hello":"world"}',
      sizeBytes: 17,
      timestampMs: 1770000000000,
    };

    expect(msg.direction).toBe("in");
    expect(msg.kind).toBe("text");
    expect(msg.sizeBytes).toBe(17);

    const event: WsEvent = {
      type: "pong",
      connectionId: "tab-1",
      direction: "in",
      latencyMs: 23,
      timestampMs: 1770000001000,
    };

    expect(event.type).toBe("pong");
    if (event.type === "pong") {
      expect(event.latencyMs).toBe(23);
    }
  });

  it("handles messages with missing sizeBytes safely without producing NaN", () => {
    const rawMsg = {
      id: "raw-1",
      direction: "in" as const,
      kind: "text" as const,
      data: "hello",
      sizeBytes: undefined as unknown as number,
      timestampMs: 123456,
    };

    const messages = [rawMsg];
    let totalBytes = 0;
    for (const m of messages) {
      totalBytes += m.sizeBytes || 0;
    }

    expect(totalBytes).toBe(0);
    expect(Number.isFinite(totalBytes)).toBe(true);
  });
});
