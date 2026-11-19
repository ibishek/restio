// Native file-picker access via tauri-plugin-dialog. Per ARCHITECTURE.md §2 the
// only `@tauri-apps` imports live in this IPC layer. We store just the chosen
// path; Rust reads the file's bytes at send time, so nothing binary ever enters
// a shared collection (ARCHITECTURE.md §8). Throws outside the Tauri shell
// (there is no native dialog under `pnpm dev`) — callers catch and no-op.

import { open, save } from "@tauri-apps/plugin-dialog";

export interface SaveDialogFilter {
  name: string;
  extensions: string[];
}

export interface SaveFileOptions {
  title?: string;
  defaultPath?: string;
  filters?: SaveDialogFilter[];
}

/** Open a native file picker; resolve to the selected absolute path, or `null`
 *  if the user cancelled. */
export async function pickFile(): Promise<string | null> {
  const selected = await open({ multiple: false, directory: false });
  return typeof selected === "string" ? selected : null;
}

/** Open a native folder picker; resolve to the selected absolute path, or `null`
 *  if the user cancelled. `defaultPath` seeds the starting location. */
export async function pickDirectory(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: true,
    defaultPath: defaultPath || undefined,
  });
  return typeof selected === "string" ? selected : null;
}

/** Open a native file save dialog; resolve to the selected absolute path, or `null`
 *  if the user cancelled. */
export async function pickSaveFile(options?: SaveFileOptions): Promise<string | null> {
  const selected = await save({
    title: options?.title,
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return typeof selected === "string" ? selected : null;
}
