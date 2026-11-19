// Workspace contract (CLAUDE.md domain model). Workspaces scope collections +
// environments; members come from the shared repo's Git history.

import type { Member, Workspace } from "#lib/types";
import { call } from "./client";

export const listWorkspaces = () => call<Workspace[]>("list_workspaces");

export const activeWorkspace = () => call<Workspace | null>("active_workspace");

/** Create a workspace (frontend supplies the id) with an empty collections set. */
export const createWorkspace = (id: string, name: string) =>
  call<Workspace>("create_workspace", { id, name });

export const switchWorkspace = (id: string) => call<void>("switch_workspace", { id });

export const renameWorkspace = (id: string, name: string) =>
  call<void>("rename_workspace", { id, name });

export const deleteWorkspace = (id: string) => call<void>("delete_workspace", { id });

/** Persist the active environment on the active workspace ("" = none). */
export const setActiveEnv = (envId: string) => call<void>("set_active_env", { envId });

/** Members of the active workspace, from Git contributors. */
export const workspaceMembers = () => call<Member[]>("workspace_members");
