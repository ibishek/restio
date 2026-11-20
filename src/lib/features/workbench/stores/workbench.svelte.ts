// Root reactive workbench store and lifecycle functions.

import {
  activeWorkspace as ipcActiveWorkspace,
  listWorkspaces,
  loadCollections,
  loadEnvironments,
  loadHistory,
  saveCollections,
  saveEnvironments,
  setActiveEnv,
  workspaceMembers,
} from "#lib/ipc";
import type { Collection, Environment, HistoryEntry, Member, Workspace } from "#lib/types";
import {
  kv,
  makeRequest,
  makeTab,
  normalizeCollections,
  uid,
  type Confirm,
  type Tab,
} from "./types";

function seed(): Collection[] {
  return [
    {
      id: uid(),
      name: "RestIO",
      baseUrl: "https://api.github.com",
      folders: [],
      requests: [
        makeRequest("Get repo", "GET", "https://api.github.com/repos/ibishek/restio", {
          headers: [kv("Accept", "application/vnd.github+json")],
        }),
        makeRequest(
          "Recent commits",
          "GET",
          "https://api.github.com/repos/ibishek/restio/commits",
          {
            headers: [kv("Accept", "application/vnd.github+json")],
          },
        ),
        makeRequest("Issues", "GET", "https://api.github.com/repos/ibishek/restio/issues", {
          headers: [kv("Accept", "application/vnd.github+json")],
        }),
      ],
    },
  ];
}

function seedEnvironments(): Environment[] {
  return [
    {
      id: uid(),
      name: "Production",
      variables: [kv("base_url", "https://api.github.com"), kv("token", ""), kv()],
    },
    {
      id: uid(),
      name: "Local",
      variables: [kv("base_url", "http://localhost:3000"), kv()],
    },
  ];
}

const initialCollections = seed();
const initialEnvironments = seedEnvironments();
const initialTab = makeTab(initialCollections[0].requests[0], {
  collectionId: initialCollections[0].id,
  folderIds: [],
});

export const wb = $state({
  tabs: [initialTab] as Tab[],
  activeTabId: initialTab.id as string | null,
  collections: initialCollections,
  environments: initialEnvironments,
  activeEnvId: (initialEnvironments[0]?.id ?? null) as string | null,
  history: [] as HistoryEntry[],
  workspaces: [] as Workspace[],
  activeWorkspaceId: null as string | null,
  members: [] as Member[],
  expanded: {} as Record<string, boolean>,
  // ── UI chrome (driven by keyboard shortcuts) ──
  sidebarCollapsed: false,
  /** Bumped to ask the Sidebar to focus its search box (⌘K). */
  searchNonce: 0,
  /** Pending unsaved-changes confirmation, or null. Rendered by ConfirmDialog. */
  confirm: null as Confirm | null,
});

for (const c of wb.collections) wb.expanded[c.id] = true;

export async function persist(): Promise<void> {
  try {
    await saveCollections($state.snapshot(wb.collections));
  } catch {
    // Ignore outside Tauri.
  }
}

export async function persistEnvironments(): Promise<void> {
  try {
    await saveEnvironments($state.snapshot(wb.environments));
  } catch {
    // Ignore outside Tauri.
  }
}

/** Persist the active environment onto the active workspace ("" = none). */
export async function persistActiveEnv(): Promise<void> {
  try {
    await setActiveEnv(wb.activeEnvId ?? "");
  } catch {
    // Ignore outside Tauri.
  }
}

/** Apply a workspace's stored active-env id to `wb.activeEnvId`, validating it
 *  still exists ("" / unknown → No environment). */
export function applyActiveEnv(envId: string | undefined): void {
  if (!envId) wb.activeEnvId = null;
  else wb.activeEnvId = wb.environments.some((e) => e.id === envId) ? envId : null;
}

/** Load collections from disk on startup; seed + persist on first run. */
export async function initWorkbench(): Promise<void> {
  await Promise.allSettled([
    (async () => {
      try {
        const loaded = await loadCollections();
        if (loaded && loaded.length) wb.collections = normalizeCollections(loaded);
        else await persist();
      } catch {
        // Not running under Tauri (e.g. `pnpm dev` in a browser) — keep the
        // in-memory seed so the UI still works for pure front-end development.
      }
    })(),
    (async () => {
      try {
        const envs = await loadEnvironments();
        if (envs && envs.length) {
          wb.environments = envs;
          if (!wb.environments.some((e) => e.id === wb.activeEnvId)) {
            wb.activeEnvId = wb.environments[0]?.id ?? null;
          }
        } else {
          await persistEnvironments();
        }
      } catch {
        // Outside Tauri — keep the seeded environments.
      }
    })(),
    (async () => {
      try {
        const hist = await loadHistory();
        if (hist) wb.history = hist;
      } catch {
        // Outside Tauri — start with an empty history.
      }
    })(),
    (async () => {
      try {
        wb.workspaces = await listWorkspaces();
        const active = await ipcActiveWorkspace();
        wb.activeWorkspaceId = active?.id ?? null;
        applyActiveEnv(active?.activeEnvId);
        wb.members = await workspaceMembers();
      } catch {
        // Outside Tauri — no workspaces; keep the in-memory defaults.
      }
    })(),
  ]);
  for (const c of wb.collections) if (!(c.id in wb.expanded)) wb.expanded[c.id] = true;
}

export function toggleSidebar(): void {
  wb.sidebarCollapsed = !wb.sidebarCollapsed;
}

/** Reactive state for the global Command Palette & Search modal. */
export const paletteState = $state({
  open: false,
});

export function openCommandPalette(): void {
  paletteState.open = true;
}

export function closeCommandPalette(): void {
  paletteState.open = false;
}

export function toggleCommandPalette(): void {
  paletteState.open = !paletteState.open;
}

/** Ask the Sidebar to focus its search box (it watches `searchNonce`). Expands
 *  the sidebar first if collapsed, so the box is actually visible. */
export function requestSearchFocus(): void {
  wb.sidebarCollapsed = false;
  wb.searchNonce++;
}
