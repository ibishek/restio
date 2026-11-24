// Request execution, cancellation, row manipulation, and cURL import.

import { cancelRequest, sendRequest, wsConnect, wsDisconnect, wsSend } from "#lib/ipc";
import { toast } from "#lib/components/ui/toasts.svelte";
import type {
  HttpMethod,
  HttpRequest,
  KeyValue,
  MultipartField,
  SavedResponse,
  WsEvent,
} from "#lib/types";
import { parseCurl } from "#lib/utils/curl";
import { humanBytes, humanMs } from "#lib/utils/format";
import { resolveRequest } from "#lib/utils/interpolate";
import { runScript } from "#lib/utils/scriptRunner";
import { composePath, effectiveAuth } from "./collections.svelte";
import { activeEnvironment, applyEnvUpdates } from "./environments.svelte";
import { recordHistory } from "./history.svelte";
import { activeTab, saveTab } from "./tabs.svelte";
import { StreamParser } from "../StreamViewer/streamParser";
import {
  defaultAuth,
  defaultStreamMetrics,
  kv,
  makeTab,
  mp,
  normalizeRequest,
  uid,
  type RequestLocation,
  type Tab,
} from "./types";
import { wb } from "./workbench.svelte";

/** Open a saved request. Focuses its tab if already open (preserving edits),
 *  otherwise opens a fresh tab with a deep copy. */
export function loadRequest(req: HttpRequest, location: RequestLocation | null = null): void {
  const existing = wb.tabs.find((t) => t.request.id === req.id);
  if (existing) {
    wb.activeTabId = existing.id;
    return;
  }
  const tab = makeTab(req, location);
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
}

/**
 * Parse a pasted cURL command and load it into the editor as a fresh, unsaved
 * request. Returns `false` when the text isn't a cURL command.
 */
export function importCurl(text: string): boolean {
  const p = parseCurl(text);
  if (!p) return false;
  const req: HttpRequest = {
    id: uid(),
    name: p.name,
    method: p.method as HttpMethod,
    url: p.url,
    params: [...p.params.map((r) => kv(r.key, r.value)), kv()],
    headers: [...p.headers.map((r) => kv(r.key, r.value)), kv()],
    auth: defaultAuth(),
    bodyMode: p.bodyMode,
    body: p.body,
    formFields: [...p.formFields.map((r) => kv(r.key, r.value)), kv()],
    multipart: p.multipart.length
      ? [...p.multipart.map((m) => ({ id: uid(), enabled: true, ...m })), mp()]
      : [mp()],
    binaryPath: p.binaryPath,
  };
  const t = activeTab();
  if (!t) return false;
  t.request = normalizeRequest(req);
  t.requestLocation = null;
  t.response = null;
  t.error = null;
  t.reqTab = p.bodyMode !== "none" ? "body" : p.headers.length ? "headers" : "params";
  return true;
}

export function methodColor(method: HttpMethod | string): string {
  if (method === "WS" || method === "WEBSOCKET") return "text-purple-400";
  const map: Record<HttpMethod, string> = {
    GET: "text-emerald-400",
    POST: "text-amber-400",
    PUT: "text-sky-400",
    PATCH: "text-violet-400",
    DELETE: "text-rose-400",
    HEAD: "text-slate-400",
    OPTIONS: "text-slate-400",
  };
  return (map as Record<string, string>)[method] ?? "text-slate-400";
}

/** Get the method or protocol badge label for a request (e.g. GET vs WS). */
export function requestLabel(req: HttpRequest): string {
  if (req.protocol === "websocket" || req.url.startsWith("ws://") || req.url.startsWith("wss://")) {
    return "WS";
  }
  return req.method;
}

export function statusTone(status: number): string {
  if (status >= 500) return "text-rose-400";
  if (status >= 400) return "text-amber-400";
  if (status >= 300) return "text-sky-400";
  if (status >= 200) return "text-emerald-400";
  return "text-ink-muted";
}

export function addRow(list: KeyValue[]): void {
  list.push(kv());
}

export function removeRow(list: KeyValue[], id: string): void {
  const i = list.findIndex((r) => r.id === id);
  if (i !== -1) list.splice(i, 1);
  if (list.length === 0) list.push(kv());
}

/** Remove every row, leaving one blank row to type into. */
export function clearRows(list: KeyValue[]): void {
  list.splice(0, list.length, kv());
}

/** Keep a trailing blank row available to type into. */
export function ensureTrailingRow(list: KeyValue[]): void {
  const last = list[list.length - 1];
  if (!last || last.key !== "" || last.value !== "") list.push(kv());
}

export function addMultipart(list: MultipartField[]): void {
  list.push(mp());
}

export function removeMultipart(list: MultipartField[], id: string): void {
  const i = list.findIndex((r) => r.id === id);
  if (i !== -1) list.splice(i, 1);
  if (list.length === 0) list.push(mp());
}

export function clearMultipart(list: MultipartField[]): void {
  list.splice(0, list.length, mp());
}

/** Keep a trailing blank multipart row available to type into. */
export function ensureTrailingMultipart(list: MultipartField[]): void {
  const last = list[list.length - 1];
  if (!last || last.key !== "" || last.value !== "" || last.filePath !== "") list.push(mp());
}

/** Send the active tab's request through the Rust engine and store the response. */
export async function send(): Promise<void> {
  const t = activeTab();
  if (!t || t.kind !== "request" || t.sending || !t.request.url.trim()) return;

  if (
    t.request.protocol === "websocket" ||
    t.request.url.startsWith("ws://") ||
    t.request.url.startsWith("wss://")
  ) {
    if (t.wsState === "connected" || t.wsState === "connecting") {
      void disconnectWebSocket(t);
    } else {
      void connectWebSocket(t);
    }
    return;
  }

  const runId = uid();
  t.currentRunId = runId;
  t.cancelled = false;
  t.sending = true;
  t.error = null;
  t.response = null;
  t.activeExampleId = null;
  t.testResults = [];
  t.scriptLogs = [];
  t.streamEvents = [];
  t.streamText = "";
  t.isStreaming = false;
  t.streamMetrics = defaultStreamMetrics();

  // 1. Pre-request script execution
  if (t.request.preRequestScript && t.request.preRequestScript.trim()) {
    try {
      const envMap = Object.fromEntries(
        activeEnvironment()
          ?.variables.filter((v) => v.enabled && v.key)
          .map((v) => [v.key, v.value]) ?? [],
      );
      const preResult = await runScript(t.request.preRequestScript, {
        environment: envMap,
        request: {
          url: t.request.url,
          method: t.request.method,
          headers: t.request.headers,
          body: t.request.body,
        },
      });
      if (preResult.logs.length) t.scriptLogs.push(...preResult.logs);
      if (Object.keys(preResult.environmentUpdates).length > 0) {
        applyEnvUpdates(preResult.environmentUpdates);
      }
      if (preResult.requestUpdates?.body !== undefined) {
        t.request.body = preResult.requestUpdates.body;
        if (t.request.bodyMode === "none") {
          t.request.bodyMode = "json";
        }
      }
      if (preResult.requestUpdates?.url !== undefined) {
        t.request.url = preResult.requestUpdates.url;
      }
      if (preResult.error) {
        toast.warn("Pre-request script error", preResult.error);
      }
    } catch (err) {
      toast.warn("Pre-request error", err instanceof Error ? err.message : String(err));
    }
  }

  const composed = structuredClone($state.snapshot(t.request)) as HttpRequest;
  composed.url = composePath(composed.url, t.requestLocation);
  composed.auth = effectiveAuth(t.requestLocation, composed.auth);

  // If params are present and enabled, strip query from URL before sending so
  // executor.rs appends params cleanly without duplicating them.
  const toSend = structuredClone(composed) as HttpRequest;
  if (toSend.params.some((p) => p.enabled && p.key.trim() !== "")) {
    const qi = toSend.url.indexOf("?");
    if (qi !== -1) {
      toSend.url = toSend.url.slice(0, qi);
    }
  }

  try {
    const resolved = resolveRequest(toSend, activeEnvironment());
    const streamParser = new StreamParser();
    let streamSwitched = false;

    t.response = await sendRequest(runId, resolved, (chunk) => {
      const result = streamParser.pushChunk(chunk);
      if (result.isSse && result.newEvents.length > 0) {
        t.isStreaming = true;
        t.streamEvents.push(...result.newEvents);
        if (result.newText) {
          t.streamText += result.newText;
        }
        t.streamMetrics = result.metrics;

        // Auto-switch to stream tab when SSE events start arriving
        if (!streamSwitched) {
          streamSwitched = true;
          t.resTab = "stream";
        }
      }
    });

    recordHistory(composed, t.response);
    const r = t.response;

    // 2. Post-response / Tests script execution
    if (t.request.testScript && t.request.testScript.trim()) {
      try {
        const postEnvMap = Object.fromEntries(
          activeEnvironment()
            ?.variables.filter((v) => v.enabled && v.key)
            .map((v) => [v.key, v.value]) ?? [],
        );
        const testOutput = await runScript(t.request.testScript, {
          environment: postEnvMap,
          request: {
            url: resolved.url,
            method: resolved.method,
            headers: resolved.headers,
            body: resolved.body,
          },
          response: r,
        });
        t.testResults = testOutput.testResults;
        if (testOutput.logs.length) t.scriptLogs.push(...testOutput.logs);
        if (Object.keys(testOutput.environmentUpdates).length > 0) {
          applyEnvUpdates(testOutput.environmentUpdates);
        }
        if (t.testResults.length > 0) {
          const passedCount = t.testResults.filter((tr) => tr.passed).length;
          const totalCount = t.testResults.length;
          if (passedCount === totalCount) {
            toast.success(`Tests passed: ${passedCount}/${totalCount}`);
          } else {
            toast.warn(`Tests failed: ${passedCount}/${totalCount} passed`);
            t.resTab = "tests";
          }
        }
        if (testOutput.error) {
          toast.warn("Test script error", testOutput.error);
        }
      } catch (scriptErr) {
        toast.warn(
          "Test script failed",
          scriptErr instanceof Error ? scriptErr.message : String(scriptErr),
        );
      }
    }

    if (t.resTab !== "tests") {
      const isSse = (r.headers["content-type"] ?? "").toLowerCase().includes("text/event-stream");
      if (streamSwitched || (isSse && t.streamEvents.length > 0)) {
        t.resTab = "stream";
      } else {
        t.resTab = "body";
      }
    }

    toast[r.status >= 400 ? "warn" : "success"](
      `${r.status} ${r.statusText}`.trim(),
      `${humanMs(r.timeMs)} · ${humanBytes(r.sizeBytes)}`,
    );
  } catch (e) {
    if (!t.cancelled) {
      t.error = e instanceof Error ? e.message : String(e);
      recordHistory(composed, null);
      toast.error("Request failed", t.error);
    }
  } finally {
    if (t.currentRunId === runId) t.currentRunId = null;
    t.sending = false;
    t.isStreaming = false;
    t.cancelled = false;
  }
}

/** Abort the active tab's in-flight request, if any. */
export async function cancel(): Promise<void> {
  const t = activeTab();
  if (!t || !t.currentRunId) return;
  const id = t.currentRunId;
  t.cancelled = true;
  try {
    await cancelRequest(id);
    toast.info("Request cancelled");
  } catch {
    // Ignore — the request may have already completed.
  }
}

/** Save the tab's current live response as an example on its request. */
export function saveResponseAsExample(t: Tab, customName?: string): SavedResponse | null {
  const r = t.response;
  if (!r) return null;
  const exampleName =
    customName?.trim() || `${r.status} ${r.statusText}`.trim() || "Example Response";
  const example: SavedResponse = {
    id: uid(),
    name: exampleName,
    status: r.status,
    statusText: r.statusText,
    timeMs: r.timeMs,
    sizeBytes: r.sizeBytes,
    headers: { ...r.headers },
    body: r.body,
    bodyEncoding: r.bodyEncoding,
    createdAt: Date.now(),
  };

  if (!t.request.savedResponses) {
    t.request.savedResponses = [];
  }
  t.request.savedResponses.push(example);
  t.activeExampleId = example.id;

  saveTab(t);
  toast.success("Saved as example", example.name);
  return example;
}

/** Delete a saved response example from the tab's request. */
export function deleteSavedResponse(t: Tab, exampleId: string): void {
  if (!t.request.savedResponses) return;
  t.request.savedResponses = t.request.savedResponses.filter((e) => e.id !== exampleId);
  if (t.activeExampleId === exampleId) {
    t.activeExampleId = null;
  }
  saveTab(t);
  toast.info("Example removed");
}

/** Rename a saved response example. */
export function renameSavedResponse(t: Tab, exampleId: string, newName: string): void {
  const trimmed = newName.trim();
  if (!trimmed || !t.request.savedResponses) return;
  const ex = t.request.savedResponses.find((e) => e.id === exampleId);
  if (ex) {
    ex.name = trimmed;
    saveTab(t);
  }
}

/** Switch the tab's view between live response and a saved example response. */
export function setActiveExample(t: Tab, exampleId: string | null): void {
  t.activeExampleId = exampleId;
}

/** Connect to the WebSocket endpoint configured in the tab. */
export async function connectWebSocket(t: Tab): Promise<void> {
  if (t.wsState === "connected" || t.wsState === "connecting") return;
  t.wsState = "connecting";
  t.error = null;
  t.response = null;

  const composed = structuredClone($state.snapshot(t.request)) as HttpRequest;
  composed.url = composePath(composed.url, t.requestLocation);

  const resolved = resolveRequest(composed, activeEnvironment());

  try {
    await wsConnect(
      t.id,
      resolved.url,
      resolved.headers,
      resolved.dangerAcceptInvalidCerts ?? false,
      (event) => {
        handleWsEvent(t, event);
      },
    );
  } catch (e) {
    t.wsState = "disconnected";
    t.error = e instanceof Error ? e.message : String(e);
    toast.error("WebSocket connection failed", t.error);
  }
}

/** Disconnect an active WebSocket connection. */
export async function disconnectWebSocket(t: Tab): Promise<void> {
  if (t.wsState === "disconnected") return;
  t.wsState = "closing";
  try {
    await wsDisconnect(t.id, 1000, "User initiated disconnect");
  } catch (e) {
    t.wsState = "disconnected";
    t.error = e instanceof Error ? e.message : String(e);
  }
}

/** Send a message (text, JSON, or base64 binary) over the active WebSocket. */
export async function sendWebSocketMessage(
  t: Tab,
  data: string,
  kind: "text" | "binary" | "ping" = "text",
): Promise<void> {
  if (t.wsState !== "connected") {
    toast.warn("Not connected", "Connect to a WebSocket server before sending messages");
    return;
  }
  try {
    await wsSend(t.id, { kind, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error("Send failed", msg);
  }
}

/** Send an outbound Ping frame over the active WebSocket. */
export async function sendWebSocketPing(t: Tab): Promise<void> {
  if (t.wsState !== "connected") return;
  try {
    await wsSend(t.id, { kind: "ping", data: "" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.error("Ping failed", msg);
  }
}

/** Clear all captured WebSocket messages in this tab. */
export function clearWebSocketMessages(t: Tab): void {
  t.wsMessages = [];
}

/** Internal handler for incoming WebSocket events dispatched over Tauri Channel. */
function handleWsEvent(t: Tab, event: WsEvent): void {
  switch (event.type) {
    case "connected":
      t.wsState = "connected";
      t.wsConnectedAt = event.timestampMs ?? (event as unknown as { timestamp_ms?: number }).timestamp_ms ?? Date.now();
      t.error = null;
      toast.success("WebSocket connected", event.url);
      break;

    case "message": {
      const size =
        event.sizeBytes ??
        (event as unknown as { size_bytes?: number }).size_bytes ??
        (event.data ? event.data.length : 0);
      const ts =
        event.timestampMs ??
        (event as unknown as { timestamp_ms?: number }).timestamp_ms ??
        Date.now();
      t.wsMessages.push({
        id: uid(),
        direction: event.direction,
        kind: event.kind,
        data: event.data,
        sizeBytes: size,
        timestampMs: ts,
      });
      break;
    }

    case "ping":
      t.wsMessages.push({
        id: uid(),
        direction: event.direction,
        kind: "ping",
        data: "Ping",
        sizeBytes: 0,
        timestampMs:
          event.timestampMs ??
          (event as unknown as { timestamp_ms?: number }).timestamp_ms ??
          Date.now(),
      });
      break;

    case "pong": {
      const latency =
        event.latencyMs ??
        (event as unknown as { latency_ms?: number }).latency_ms;
      if (latency !== undefined) {
        t.wsLastPingRttMs = latency;
      }
      t.wsMessages.push({
        id: uid(),
        direction: event.direction,
        kind: "pong",
        data: "Pong",
        sizeBytes: 0,
        timestampMs:
          event.timestampMs ??
          (event as unknown as { timestamp_ms?: number }).timestamp_ms ??
          Date.now(),
        latencyMs: latency,
      });
      break;
    }

    case "closed":
      t.wsState = "disconnected";
      t.wsConnectedAt = null;
      if (!event.clean && event.reason) {
        toast.warn("WebSocket closed", event.reason);
      }
      if (t.wsAutoReconnect && !event.clean) {
        setTimeout(() => {
          if (t.wsState === "disconnected") {
            void connectWebSocket(t);
          }
        }, 3000);
      }
      break;

    case "error":
      t.error = event.message;
      toast.error("WebSocket error", event.message);
      break;
  }
}
