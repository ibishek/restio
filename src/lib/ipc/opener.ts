// Native file and URL opening via tauri-plugin-opener. Per ARCHITECTURE.md §2 the
// only `@tauri-apps` imports live in this IPC layer.

import { openPath, openUrl } from "@tauri-apps/plugin-opener";

/** Open a file path with the default system application. */
export async function openFile(path: string): Promise<void> {
  await openPath(path);
}

/** Open a URL in the user's default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  await openUrl(url);
}
