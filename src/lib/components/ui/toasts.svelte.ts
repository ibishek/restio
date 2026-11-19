// Lightweight global toast store. A single reactive list any feature can push
// to; `Toaster.svelte` renders it (aria-live) at the app root. Toasts
// auto-dismiss — errors linger longer since they carry recovery info.

export type ToastKind = "success" | "error" | "info" | "warn";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** Optional secondary line (e.g. an error detail or a hint). */
  detail?: string;
}

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** The live toast stack, newest last. Iterate this reactively in the UI. */
export const toasts = $state<Toast[]>([]);

/** Show a toast; returns its id. `ttl` ms until auto-dismiss (0 = sticky). */
export function pushToast(
  kind: ToastKind,
  message: string,
  detail?: string,
  ttl = kind === "error" ? 6000 : 3500,
): number {
  const id = ++seq;
  toasts.push({ id, kind, message, detail });
  if (ttl > 0)
    timers.set(
      id,
      setTimeout(() => dismissToast(id), ttl),
    );
  return id;
}

export function dismissToast(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

/** Ergonomic shorthands. */
export const toast = {
  success: (message: string, detail?: string) => pushToast("success", message, detail),
  error: (message: string, detail?: string) => pushToast("error", message, detail),
  info: (message: string, detail?: string) => pushToast("info", message, detail),
  warn: (message: string, detail?: string) => pushToast("warn", message, detail),
};
