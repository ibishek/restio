// Native app metadata via @tauri-apps/api/app (ARCHITECTURE.md §2).
import { getVersion as tauriGetVersion } from "@tauri-apps/api/app";

/**
 * Get current application version.
 * Inside Tauri, resolves via `tauriGetVersion()`; falls back to `__APP_VERSION__` in browser/tests.
 */
export async function getAppVersion(): Promise<string> {
  try {
    return await tauriGetVersion();
  } catch {
    return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.1.0";
  }
}
