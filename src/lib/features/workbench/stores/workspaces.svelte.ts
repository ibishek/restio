// Workspace management, switching, and scoped data reloading.

import {
  activeWorkspace as ipcActiveWorkspace,
  createWorkspace as ipcCreateWorkspace,
  deleteWorkspace as ipcDeleteWorkspace,
  listWorkspaces,
  loadCollections,
  loadEnvironments,
  renameWorkspace as ipcRenameWorkspace,
  switchWorkspace as ipcSwitchWorkspace,
  workspaceMembers,
} from "#lib/ipc";
import { normalizeCollections, uid } from "./types";
import { applyActiveEnv, wb } from "./workbench.svelte";

/** Re-read collections from disk (after a Git clone/pull repoints or updates
 *  the collections file). Keeps expansion state for collections that persist. */
export async function reloadCollections(): Promise<void> {
  try {
    const loaded = await loadCollections();
    wb.collections = loaded && loaded.length ? normalizeCollections(loaded) : [];
    for (const c of wb.collections) if (!(c.id in wb.expanded)) wb.expanded[c.id] = true;
  } catch {
    // Ignore outside Tauri.
  }
}

/** Name of the active workspace (for the top-bar switcher). */
export function activeWorkspaceName(): string {
  return wb.workspaces.find((w) => w.id === wb.activeWorkspaceId)?.name ?? "Workspace";
}

/** Reload everything scoped to the active workspace: collections, environments,
 *  members, and the active-environment selection. */
export async function reloadWorkspaceData(): Promise<void> {
  await reloadCollections();
  try {
    const envs = await loadEnvironments();
    wb.environments = envs && envs.length ? envs : [];
  } catch {
    // Ignore outside Tauri.
  }
  try {
    const active = await ipcActiveWorkspace();
    wb.activeWorkspaceId = active?.id ?? wb.activeWorkspaceId;
    applyActiveEnv(active?.activeEnvId);
    wb.members = await workspaceMembers();
  } catch {
    // Ignore outside Tauri.
  }
}

/** Refresh the member list — after a Git sync brings in new commits/authors. */
export async function refreshMembers(): Promise<void> {
  try {
    wb.members = await workspaceMembers();
  } catch {
    // Ignore outside Tauri.
  }
}

export async function switchWorkspace(id: string): Promise<void> {
  if (id === wb.activeWorkspaceId) return;
  try {
    await ipcSwitchWorkspace(id);
    wb.activeWorkspaceId = id;
    await reloadWorkspaceData();
  } catch {
    // Ignore outside Tauri.
  }
}

export async function createWorkspace(name = "New workspace"): Promise<void> {
  try {
    const ws = await ipcCreateWorkspace(uid(), name);
    wb.workspaces = await listWorkspaces();
    wb.activeWorkspaceId = ws.id;
    await reloadWorkspaceData();
  } catch {
    // Ignore outside Tauri.
  }
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  try {
    await ipcRenameWorkspace(id, name);
    const ws = wb.workspaces.find((w) => w.id === id);
    if (ws) ws.name = name;
  } catch {
    // Ignore outside Tauri.
  }
}

/** Delete a workspace (keeping at least one). Switches to another if active. */
export async function deleteWorkspace(id: string): Promise<void> {
  if (wb.workspaces.length <= 1) return;
  try {
    await ipcDeleteWorkspace(id);
    wb.workspaces = await listWorkspaces();
    const active = await ipcActiveWorkspace();
    wb.activeWorkspaceId = active?.id ?? null;
    await reloadWorkspaceData();
  } catch {
    // Ignore outside Tauri.
  }
}
