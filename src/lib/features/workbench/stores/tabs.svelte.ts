// Tab lifecycle, switching, unsaved change tracking, and prompt guards.

import { cancelRequest } from "#lib/ipc";
import { toast } from "#lib/components/ui/toasts.svelte";
import type { HttpRequest, KeyValue, MultipartField } from "#lib/types";
import {
  containerAt,
  containerNode,
  deleteRequestAt,
  findRequestById,
  replaceRequestById,
} from "./collections.svelte";
import {
  kv,
  makeRequest,
  makeTab,
  normalizeRequest,
  uid,
  type RequestLocation,
  type Tab,
} from "./types";
import { persist, wb } from "./workbench.svelte";

/** The currently focused tab, or `null` when every tab has been closed. */
export function activeTab(): Tab | null {
  return wb.tabs.find((t) => t.id === wb.activeTabId) ?? wb.tabs[0] ?? null;
}

export function selectTab(id: string): void {
  if (wb.tabs.some((t) => t.id === id)) wb.activeTabId = id;
}

/** Open a blank, unsaved request in a new tab (⌘N / the "+" button). */
export function newTab(): void {
  const tab = makeTab(makeRequest("New request", "GET", ""), null);
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
}

/** Close a tab. Activates a neighbour; when the last tab is closed the workbench
 *  is left empty rather than auto-opening a fresh tab. */
export function closeTab(id: string): void {
  const i = wb.tabs.findIndex((t) => t.id === id);
  if (i === -1) return;
  const [closed] = wb.tabs.splice(i, 1);
  if (closed.currentRunId) void cancelRequest(closed.currentRunId).catch(() => {});
  if (wb.tabs.length === 0) {
    wb.activeTabId = null;
    return;
  }
  if (wb.activeTabId === id) {
    wb.activeTabId = (wb.tabs[i] ?? wb.tabs[i - 1] ?? wb.tabs[0]).id;
  }
}

/** A short title for the tab strip. */
export function tabTitle(tab: Tab): string {
  if (tab.kind === "container") return containerNode(tab.containerLoc)?.name.trim() || "Settings";
  return tab.request.name.trim() || "Untitled";
}

/** Duplicate a tab as an independent draft, inserted right after the source. */
export function duplicateTab(id: string): void {
  const src = wb.tabs.find((t) => t.id === id);
  if (!src || src.kind !== "request") return;
  const req = structuredClone($state.snapshot(src.request)) as HttpRequest;
  req.id = uid();
  req.name = `${src.request.name} copy`.trim();
  const dup = makeTab(req, src.requestLocation);
  const i = wb.tabs.findIndex((t) => t.id === id);
  wb.tabs.splice(i + 1, 0, dup);
  wb.activeTabId = dup.id;
}

function abortTab(t: Tab): void {
  if (t.currentRunId) void cancelRequest(t.currentRunId).catch(() => {});
}

/** Close every tab except `id`. */
export function closeOtherTabs(id: string): void {
  const keep = wb.tabs.find((t) => t.id === id);
  if (!keep) return;
  for (const t of wb.tabs) if (t.id !== id) abortTab(t);
  wb.tabs = [keep];
  wb.activeTabId = keep.id;
}

// Helpers for canonRequest — drop volatile row ids and trailing blank rows.
export const canonRows = (list: KeyValue[]) =>
  list.filter((x) => x.key || x.value).map((x) => ({ k: x.key, v: x.value, e: x.enabled }));
export const canonParts = (list: MultipartField[]) =>
  list
    .filter((x) => x.key || x.value || x.filePath)
    .map((x) => ({ k: x.key, kind: x.kind, v: x.value, f: x.filePath, e: x.enabled }));

/** Canonical form of a request for change detection. */
export function canonRequest(r: HttpRequest): string {
  return JSON.stringify({
    name: r.name,
    method: r.method,
    url: r.url,
    params: canonRows(r.params),
    headers: canonRows(r.headers),
    auth: r.auth,
    bodyMode: r.bodyMode,
    body: r.body,
    form: canonRows(r.formFields),
    multipart: canonParts(r.multipart),
    binaryPath: r.binaryPath,
    deprecated: !!r.deprecated,
    preRequestScript: r.preRequestScript ?? "",
    testScript: r.testScript ?? "",
    savedResponses: (r.savedResponses ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      body: s.body,
      headers: s.headers,
    })),
  });
}

const BLANK_REQUEST_CANON = canonRequest(normalizeRequest(makeRequest("New request", "GET", "")));

/** Has this tab got unsaved changes? */
export function isTabDirty(tab: Tab): boolean {
  if (tab.kind === "container") return false;
  const stored = findRequestById(wb.collections, tab.request.id);
  if (!stored) return canonRequest(tab.request) !== BLANK_REQUEST_CANON;
  return canonRequest(tab.request) !== canonRequest(stored);
}

/** Any tab with unsaved changes? */
export function hasUnsavedTabs(): boolean {
  return wb.tabs.some((t) => isTabDirty(t));
}

/** Close a tab, prompting first if it has unsaved changes. */
export function requestCloseTab(id: string): void {
  const t = wb.tabs.find((x) => x.id === id);
  if (!t) return;
  if (!isTabDirty(t)) {
    closeTab(id);
    return;
  }
  wb.confirm = {
    title: "Unsaved changes",
    message: `“${tabTitle(t)}” has unsaved changes. Save before closing?`,
    confirmLabel: "Save & close",
    onConfirm: () => {
      saveTab(t);
      closeTab(id);
    },
    discardLabel: "Don't save",
    onDiscard: () => closeTab(id),
  };
}

/** Close all tabs except `id`, prompting if any of the others are unsaved. */
export function requestCloseOthers(id: string): void {
  const dirty = wb.tabs.filter((t) => t.id !== id && isTabDirty(t)).length;
  if (dirty === 0) {
    closeOtherTabs(id);
    return;
  }
  wb.confirm = {
    title: "Unsaved changes",
    message: `${dirty} other tab${dirty === 1 ? "" : "s"} ${dirty === 1 ? "has" : "have"} unsaved changes. Close ${dirty === 1 ? "it" : "them"} anyway?`,
    confirmLabel: "Close anyway",
    onConfirm: () => closeOtherTabs(id),
  };
}

/** Close every tab with no unsaved changes (keeps edited/draft tabs). */
export function closeUneditedTabs(): void {
  const keep = wb.tabs.filter((t) => isTabDirty(t));
  if (keep.length === 0) {
    const act = activeTab();
    if (!act) return;
    for (const t of wb.tabs) if (t.id !== act.id) abortTab(t);
    wb.tabs = [act];
    wb.activeTabId = act.id;
    return;
  }
  for (const t of wb.tabs) if (!keep.includes(t)) abortTab(t);
  wb.tabs = keep;
  if (!keep.some((t) => t.id === wb.activeTabId)) wb.activeTabId = keep[keep.length - 1].id;
}

/** Explicitly persist a tab's request into the tree. */
export function saveTab(t: Tab): void {
  const snap = structuredClone($state.snapshot(t.request)) as HttpRequest;
  if (replaceRequestById(wb.collections, snap)) {
    void persist();
    toast.success("Request saved", snap.name);
    return;
  }
  const container = t.requestLocation ? containerAt(t.requestLocation) : null;
  if (container) {
    container.requests.push(snap);
    void persist();
    toast.success("Request saved", snap.name);
    return;
  }
  let drafts = wb.collections.find((c) => c.name === "Drafts");
  if (!drafts) {
    drafts = { id: uid(), name: "Drafts", baseUrl: "", folders: [], requests: [] };
    wb.collections.push(drafts);
    wb.expanded[drafts.id] = true;
  }
  drafts.requests.push(snap);
  t.requestLocation = { collectionId: drafts.id, folderIds: [] };
  void persist();
  toast.success("Saved to Drafts", snap.name);
}

/** Save the focused tab (Save button / ⌘S). */
export function saveCurrentRequest(): boolean {
  const t = activeTab();
  if (!t || t.kind !== "request" || !isTabDirty(t)) return false;
  saveTab(t);
  return true;
}

/** Open a fresh, unsaved blank request in a new tab (⌘N / the "+" button). */
export function newRequest(): void {
  newTab();
}

/** Open a fresh SSE streaming request in a new tab. */
export function newSseRequest(): void {
  const req = makeRequest("New SSE stream", "GET", "", {
    headers: [kv("Accept", "text/event-stream"), kv("Cache-Control", "no-cache")],
  });
  const tab = makeTab(req, null);
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
  toast.success("Created SSE request", "Accept: text/event-stream added");
}

/** Open a fresh WebSocket request in a new tab. */
export function newWsRequest(): void {
  const req = makeRequest("New WebSocket", "GET", "wss://echo.websocket.events", {
    protocol: "websocket",
  });
  const tab = makeTab(req, null);
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
  toast.success("Created WebSocket request", "wss://echo.websocket.events configured");
}

/** Injects SSE streaming headers into the active tab's request. */
export function addSseHeadersToActive(): void {
  const t = activeTab();
  if (!t || t.kind !== "request") {
    toast.warn("No active request to configure");
    return;
  }

  // Set or update Accept: text/event-stream
  const accept = t.request.headers.find((h) => h.key.trim().toLowerCase() === "accept");
  if (accept) {
    accept.value = "text/event-stream";
    accept.enabled = true;
  } else {
    const last = t.request.headers[t.request.headers.length - 1];
    if (last && !last.key && !last.value) {
      t.request.headers.splice(t.request.headers.length - 1, 0, {
        id: uid(),
        key: "Accept",
        value: "text/event-stream",
        enabled: true,
      });
    } else {
      t.request.headers.push({
        id: uid(),
        key: "Accept",
        value: "text/event-stream",
        enabled: true,
      });
    }
  }

  // Ensure Cache-Control: no-cache
  const cache = t.request.headers.find((h) => h.key.trim().toLowerCase() === "cache-control");
  if (cache) {
    cache.enabled = true;
  } else {
    const last = t.request.headers[t.request.headers.length - 1];
    if (last && !last.key && !last.value) {
      t.request.headers.splice(t.request.headers.length - 1, 0, {
        id: uid(),
        key: "Cache-Control",
        value: "no-cache",
        enabled: true,
      });
    } else {
      t.request.headers.push({
        id: uid(),
        key: "Cache-Control",
        value: "no-cache",
        enabled: true,
      });
    }
  }

  t.reqTab = "headers";
  toast.success("SSE headers configured", "Accept: text/event-stream set");
}

/** Delete a request, prompting first when an open tab for it has unsaved changes. */
export function requestDeleteRequest(loc: RequestLocation, reqId: string): void {
  const dirtyTab = wb.tabs.find(
    (t) => t.kind === "request" && t.request.id === reqId && isTabDirty(t),
  );
  if (!dirtyTab) {
    deleteRequestAt(loc, reqId, closeTab);
    return;
  }
  wb.confirm = {
    title: "Delete request",
    message: `“${dirtyTab.request.name.trim() || "This request"}” has unsaved changes. Delete it anyway? This can't be undone.`,
    confirmLabel: "Delete",
    onConfirm: () => deleteRequestAt(loc, reqId, closeTab),
  };
}
