// The ONE place `invoke` from @tauri-apps is imported (ARCHITECTURE.md §5).
// Everything else calls the typed wrappers in this folder.
import { invoke } from "@tauri-apps/api/core";

/** Invoke a Rust command, normalizing any failure into an `Error`. */
export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw normalizeError(e);
  }
}

function normalizeError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === "string") return new Error(e);
  // Tauri may reject with a serialized value that isn't an Error.
  try {
    return new Error(JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
}
