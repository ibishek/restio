import type { Collection, Environment, HistoryEntry, UserSettings } from "#lib/types";
import { call } from "./client";

/** Load persisted collections, or `null` if nothing has been saved yet. */
export const loadCollections = () => call<Collection[] | null>("load_collections");

/** Persist the full collections document to disk. */
export const saveCollections = (collections: Collection[]) =>
  call<void>("save_collections", { collections });

/** Load persisted environments, or `null` if nothing has been saved yet. */
export const loadEnvironments = () => call<Environment[] | null>("load_environments");

/** Persist the full environments document to disk (local only — never shared). */
export const saveEnvironments = (environments: Environment[]) =>
  call<void>("save_environments", { environments });

/** Load the persisted send log, or `null` if nothing has been saved yet. */
export const loadHistory = () => call<HistoryEntry[] | null>("load_history");

/** Persist the full send log to disk (local only — never shared). */
export const saveHistory = (history: HistoryEntry[]) => call<void>("save_history", { history });

/** Append a single history entry to the persistent send log. */
export const appendHistoryEntry = (entry: HistoryEntry) =>
  call<void>("append_history_entry", { entry });

/** Delete a single history entry by its ID. */
export const deleteHistoryEntry = (id: string) => call<void>("delete_history_entry", { id });

/** Clear the entire persistent history log. */
export const clearHistoryStore = () => call<void>("clear_history");

/** Load all user settings (theme, active environment, collections path, …). */
export const loadSettings = () => call<UserSettings>("load_settings");

/** Upsert user settings; keys not present are left untouched. */
export const saveSettings = (settings: UserSettings) => call<void>("save_settings", { settings });

/** The file path where collections are stored (Git-shareable). */
export const getCollectionsPath = () => call<string>("get_collections_path");

/** Point collections at a new path (e.g. a Git working copy). */
export const setCollectionsPath = (path: string) => call<void>("set_collections_path", { path });

/** Save a response body to the Downloads folder; resolves to the saved path. */
export const saveResponseBody = (body: string, encoding: string, contentType: string) =>
  call<string>("save_response_body", { body, encoding, contentType });

/** Save a response body or copy an offloaded response file to a specific destination path. */
export const saveResponseToFile = (
  destPath: string,
  body?: string | null,
  encoding?: string | null,
  sourceFile?: string | null,
) =>
  call<string>("save_response_to_file", {
    destPath,
    body: body ?? null,
    encoding: encoding ?? null,
    sourceFile: sourceFile ?? null,
  });
