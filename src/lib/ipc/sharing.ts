// Git-based collection sharing contract (ARCHITECTURE.md §8). The rest of the
// app depends only on this surface, never on the transport in `src-tauri/sync/`
// — swapping Git for another backend must touch only here + the Rust side.

import type { GitStatus, PullResult, ResolveStrategy } from "#lib/types";
import { call } from "./client";

/** Git state of the current collections repo. */
export const sharingStatus = () => call<GitStatus>("sharing_status");

/** A sensible default directory to create/clone a shared repo into. */
export const sharingDefaultDir = () => call<string>("sharing_default_dir");

/** Turn `dir` into a fresh repo seeded with the current collections. */
export const sharingInit = (dir: string) => call<GitStatus>("sharing_init", { dir });

/** Clone `url` into `dir` and point collections at it. */
export const sharingClone = (url: string, dir: string) =>
  call<GitStatus>("sharing_clone", { url, dir });

/** Set (or update) the `origin` remote. */
export const sharingSetRemote = (url: string) => call<GitStatus>("sharing_set_remote", { url });

/** Commit the current collections and push to `origin` (if any). */
export const sharingPublish = (message: string) => call<GitStatus>("sharing_publish", { message });

/** Pull the latest collections (commits pending local edits first). The result
 *  says whether it fast-forwarded, was already current, or diverged. */
export const sharingPull = () => call<PullResult>("sharing_pull");

/** Resolve a diverged pull at the file level: take the remote or keep local. */
export const sharingResolvePull = (strategy: ResolveStrategy) =>
  call<GitStatus>("sharing_resolve_pull", { strategy });
