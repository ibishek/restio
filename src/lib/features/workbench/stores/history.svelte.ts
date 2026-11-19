// Send log persistence and history operations.

import { appendHistoryEntry, clearHistoryStore, deleteHistoryEntry } from "#lib/ipc";
import type { HistoryEntry, HttpRequest, HttpResponse } from "#lib/types";
import { uid } from "./types";
import { wb } from "./workbench.svelte";

/** Keep the send log bounded — the newest entries matter most. */
export const HISTORY_LIMIT = 200;

/** Record a completed send (newest first). Not called for cancelled requests. */
export function recordHistory(req: HttpRequest, res: HttpResponse | null): void {
  const entry: HistoryEntry = {
    id: uid(),
    at: Date.now(),
    request: req,
    status: res?.status ?? null,
    statusText: res?.statusText ?? "",
    timeMs: res?.timeMs ?? 0,
    sizeBytes: res?.sizeBytes ?? 0,
    ok: res !== null,
  };
  wb.history.unshift(entry);
  if (wb.history.length > HISTORY_LIMIT) wb.history.length = HISTORY_LIMIT;
  void appendHistoryEntry($state.snapshot(entry)).catch(() => {
    // Ignore outside Tauri.
  });
}

/** Remove a single history entry. */
export function removeHistoryEntry(id: string): void {
  const i = wb.history.findIndex((h) => h.id === id);
  if (i !== -1) {
    wb.history.splice(i, 1);
    void deleteHistoryEntry(id).catch(() => {
      // Ignore outside Tauri.
    });
  }
}

/** Clear the entire send log. */
export function clearHistory(): void {
  wb.history = [];
  void clearHistoryStore().catch(() => {
    // Ignore outside Tauri.
  });
}
