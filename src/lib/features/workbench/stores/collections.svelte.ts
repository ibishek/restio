// Collection tree navigation, mutations, auth inheritance, and path composition.

import type {
  AuthType,
  Collection,
  Environment,
  Folder,
  HttpRequest,
  RequestAuth,
} from "#lib/types";
import { buildVarMap, interpolate } from "#lib/utils/interpolate";
import { composeUrl, isAbsoluteUrl } from "#lib/utils/url";
import { activeEnvironment } from "./environments.svelte";
import {
  makeRequest,
  makeTab,
  noneAuth,
  normalizeCollection,
  sameLoc,
  uid,
  type RequestLocation,
} from "./types";
import { persist, wb } from "./workbench.svelte";

/** The collection or folder a location points at (both hold `folders`+`requests`),
 *  or `null` if the path no longer resolves. */
export function containerAt(loc: RequestLocation): Collection | Folder | null {
  const col = wb.collections.find((c) => c.id === loc.collectionId);
  if (!col) return null;
  let node: Collection | Folder = col;
  for (const fid of loc.folderIds) {
    const next: Folder | undefined = node.folders.find((f) => f.id === fid);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Resolve a container tab's location to its live folder/collection node (a
 *  reactive reference into `wb.collections`), or `null` if it no longer exists. */
export function containerNode(loc: RequestLocation | null): Collection | Folder | null {
  return loc ? containerAt(loc) : null;
}

/** Open a folder/collection's settings in its own editor tab (focusing an
 *  already-open one). */
export function openContainerSettings(loc: RequestLocation): void {
  const existing = wb.tabs.find(
    (t) => t.kind === "container" && t.containerLoc && sameLoc(t.containerLoc, loc),
  );
  if (existing) {
    wb.activeTabId = existing.id;
    return;
  }
  const tab = makeTab(makeRequest("", "GET", ""), null);
  tab.kind = "container";
  tab.containerLoc = loc;
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
}

/** Resolve a location to its base URL + ordered ancestor folder prefixes. */
export function contextFor(loc: RequestLocation | null): { baseUrl: string; prefixes: string[] } {
  if (!loc) return { baseUrl: "", prefixes: [] };
  const col = wb.collections.find((c) => c.id === loc.collectionId);
  if (!col) return { baseUrl: "", prefixes: [] };
  const prefixes: string[] = [];
  let level = col.folders;
  for (const fid of loc.folderIds) {
    const f = level.find((x) => x.id === fid);
    if (!f) break;
    prefixes.push(f.urlPrefix);
    level = f.folders;
  }
  return { baseUrl: col.baseUrl, prefixes };
}

/** The containers a location passes through, collection root first, deepest
 *  folder last — the chain auth inheritance walks. */
export function authChain(loc: RequestLocation): (Collection | Folder)[] {
  const col = wb.collections.find((c) => c.id === loc.collectionId);
  if (!col) return [];
  const chain: (Collection | Folder)[] = [col];
  let level: Folder[] = col.folders;
  for (const fid of loc.folderIds) {
    const f: Folder | undefined = level.find((x) => x.id === fid);
    if (!f) break;
    chain.push(f);
    level = f.folders;
  }
  return chain;
}

/** Resolve a request's effective auth, Postman-style: its own auth unless that
 *  is `"inherit"`, in which case walk from the deepest folder up to the
 *  collection and use the nearest one that sets a concrete auth. Always returns
 *  a concrete config (never `"inherit"`) — this is what is sent / exported. */
export function effectiveAuth(loc: RequestLocation | null, ownAuth: RequestAuth): RequestAuth {
  if (ownAuth.type !== "inherit") return ownAuth;
  if (!loc) return noneAuth();
  const chain = authChain(loc);
  for (let i = chain.length - 1; i >= 0; i--) {
    const a = chain[i].auth;
    if (a && a.type !== "inherit") return a;
  }
  return noneAuth();
}

/** For the editor hint: the container name + auth type an `"inherit"` request
 *  actually picks up, or `null` when nothing up the tree sets one (→ no auth). */
export function authSource(
  loc: RequestLocation | null,
  ownAuth: RequestAuth,
): { name: string; type: AuthType } | null {
  if (ownAuth.type !== "inherit" || !loc) return null;
  const chain = authChain(loc);
  for (let i = chain.length - 1; i >= 0; i--) {
    const a = chain[i].auth;
    if (a && a.type !== "inherit") return { name: chain[i].name, type: a.type };
  }
  return null;
}

/** Apply the open request's base URL + folder prefixes to a path (reactive — it
 *  reads `wb`). Returns the path unchanged when there's no base/prefix context. */
export function composePath(
  url: string,
  loc: RequestLocation | null = (wb.tabs.find((t) => t.id === wb.activeTabId) ?? wb.tabs[0] ?? null)
    ?.requestLocation ?? null,
  env: Environment | null = activeEnvironment(),
): string {
  if (isAbsoluteUrl(url)) return url;
  if (env) {
    const vars = buildVarMap(env);
    if (isAbsoluteUrl(interpolate(url, vars))) return url;
  }
  const { baseUrl, prefixes } = contextFor(loc);
  return composeUrl(baseUrl, prefixes, url);
}

/** The open request's fully composed URL, for the editor's effective-URL hint. */
export function effectiveUrl(): string {
  const active = wb.tabs.find((t) => t.id === wb.activeTabId) ?? wb.tabs[0] ?? null;
  return composePath(active?.request.url ?? "");
}

/** The base URL + folder prefixes prepended to the request's path, for display
 *  as a read-only segment in the URL bar. */
export function effectivePrefix(): string {
  const t = wb.tabs.find((tab) => tab.id === wb.activeTabId) ?? wb.tabs[0] ?? null;
  if (!t) return "";
  const eff = composePath(t.request.url);
  const raw = t.request.url;
  return eff !== raw && eff.endsWith(raw) ? eff.slice(0, eff.length - raw.length) : "";
}

/** Replace a request by id anywhere in the tree; returns whether it was found. */
export function replaceInContainer(node: Collection | Folder, snap: HttpRequest): boolean {
  const i = node.requests.findIndex((r) => r.id === snap.id);
  if (i !== -1) {
    node.requests[i] = snap;
    return true;
  }
  return node.folders.some((f) => replaceInContainer(f, snap));
}

export const replaceRequestById = (cols: Collection[], snap: HttpRequest): boolean =>
  cols.some((c) => replaceInContainer(c, snap));

/** Find a request by id anywhere in the collection tree, or `null`. */
export function findRequestById(nodes: (Collection | Folder)[], id: string): HttpRequest | null {
  for (const node of nodes) {
    const hit = node.requests.find((r) => r.id === id);
    if (hit) return hit;
    const nested = findRequestById(node.folders, id);
    if (nested) return nested;
  }
  return null;
}

/** Persist the collection tree after an inline edit (rename, base URL, prefix). */
export function commitCollections(): void {
  void persist();
}

/** Create a new top-level collection and expand it. */
export function createCollection(name = "New collection"): void {
  const c: Collection = { id: uid(), name, baseUrl: "", folders: [], requests: [] };
  wb.collections.push(c);
  wb.expanded[c.id] = true;
  void persist();
}

/** Add an imported collection (e.g. from Postman) to the tree, normalized. */
export function addImportedCollection(col: Collection): void {
  const norm = normalizeCollection(col);
  wb.collections.push(norm);
  wb.expanded[norm.id] = true;
  void persist();
}

/** Add a new folder inside the collection/folder at `loc`. */
export function addFolder(loc: RequestLocation): void {
  const container = containerAt(loc);
  if (!container) return;
  const f: Folder = { id: uid(), name: "New folder", urlPrefix: "", folders: [], requests: [] };
  container.folders.push(f);
  wb.expanded[f.id] = true;
  void persist();
}

/** Add a blank request inside the collection/folder at `loc` and open it in a tab. */
export function addRequestTo(loc: RequestLocation): void {
  const container = containerAt(loc);
  if (!container) return;
  const req = makeRequest("New request", "GET", "");
  container.requests.push(req);
  const tab = makeTab(req, loc);
  wb.tabs.push(tab);
  wb.activeTabId = tab.id;
  void persist();
}

/** Delete the collection (empty `folderIds`) or the folder at `loc` from its
 *  parent, along with everything inside it. */
export function deleteContainer(loc: RequestLocation, onTabClose?: (id: string) => void): void {
  if (loc.folderIds.length === 0) {
    wb.collections = wb.collections.filter((c) => c.id !== loc.collectionId);
  } else {
    const targetId = loc.folderIds[loc.folderIds.length - 1];
    const parent = containerAt({
      collectionId: loc.collectionId,
      folderIds: loc.folderIds.slice(0, -1),
    });
    if (parent) parent.folders = parent.folders.filter((f) => f.id !== targetId);
  }
  // Close any settings tab whose node just disappeared.
  for (const ct of wb.tabs.filter(
    (t) => t.kind === "container" && !containerNode(t.containerLoc),
  )) {
    if (onTabClose) onTabClose(ct.id);
    else {
      const idx = wb.tabs.findIndex((t) => t.id === ct.id);
      if (idx !== -1) wb.tabs.splice(idx, 1);
    }
  }
  void persist();
}

/** Delete a request by id from the collection/folder at `loc`. */
export function deleteRequestAt(
  loc: RequestLocation,
  reqId: string,
  onTabClose?: (id: string) => void,
): void {
  for (const tab of wb.tabs.filter((t) => t.kind === "request" && t.request.id === reqId)) {
    if (onTabClose) onTabClose(tab.id);
    else {
      const idx = wb.tabs.findIndex((t) => t.id === tab.id);
      if (idx !== -1) wb.tabs.splice(idx, 1);
    }
  }
  const container = containerAt(loc);
  if (container) container.requests = container.requests.filter((r) => r.id !== reqId);
  void persist();
}

/** Recursively flip a request's `deprecated` flag by id; returns whether found. */
function setDeprecatedInContainer(node: Collection | Folder, reqId: string, dep: boolean): boolean {
  const r = node.requests.find((x) => x.id === reqId);
  if (r) {
    r.deprecated = dep;
    return true;
  }
  return node.folders.some((f) => setDeprecatedInContainer(f, reqId, dep));
}

/** Toggle the open request's `deprecated` flag, persisting it on the stored copy
 *  (if saved) without committing other in-editor edits. */
export function toggleCurrentRequestDeprecated(): void {
  const activeTabId = wb.activeTabId;
  const t = wb.tabs.find((tab) => tab.id === activeTabId) ?? wb.tabs[0] ?? null;
  if (!t) return;
  const req = t.request;
  const dep = !req.deprecated;
  req.deprecated = dep;
  if (wb.collections.some((c) => setDeprecatedInContainer(c, req.id, dep))) void persist();
}

/** Mark/unmark the folder at `loc` as deprecated. */
export function setFolderDeprecated(loc: RequestLocation, dep: boolean): void {
  if (loc.folderIds.length === 0) return;
  const folder = containerAt(loc) as Folder | null;
  if (!folder) return;
  folder.deprecated = dep;
  void persist();
}

/** Would moving the folder at `folderLoc` into `to` create a cycle? */
export function wouldCycle(folderLoc: RequestLocation, to: RequestLocation): boolean {
  return (
    to.collectionId === folderLoc.collectionId &&
    to.folderIds.length >= folderLoc.folderIds.length &&
    folderLoc.folderIds.every((id, i) => to.folderIds[i] === id)
  );
}

/** Move a request from container `from` into container `to`. */
export function moveRequest(
  from: RequestLocation,
  reqId: string,
  to: RequestLocation,
  beforeId?: string,
): void {
  const src = containerAt(from);
  const dst = containerAt(to);
  if (!src || !dst) return;
  const i = src.requests.findIndex((r) => r.id === reqId);
  if (i === -1) return;
  const [req] = src.requests.splice(i, 1);
  const bi = beforeId ? dst.requests.findIndex((r) => r.id === beforeId) : -1;
  dst.requests.splice(bi === -1 ? dst.requests.length : bi, 0, req);
  for (const t of wb.tabs) if (t.request.id === reqId) t.requestLocation = to;
  void persist();
}

/** Move the folder at `folderLoc` into container `to`. */
export function moveFolder(
  folderLoc: RequestLocation,
  to: RequestLocation,
  beforeFolderId?: string,
): void {
  if (folderLoc.folderIds.length === 0 || wouldCycle(folderLoc, to)) return;
  const fid = folderLoc.folderIds[folderLoc.folderIds.length - 1];
  if (fid === beforeFolderId) return;
  const parent = containerAt({
    collectionId: folderLoc.collectionId,
    folderIds: folderLoc.folderIds.slice(0, -1),
  });
  const dst = containerAt(to);
  if (!parent || !dst) return;
  const i = parent.folders.findIndex((f) => f.id === fid);
  if (i === -1) return;
  const [folder] = parent.folders.splice(i, 1);
  const bi = beforeFolderId ? dst.folders.findIndex((f) => f.id === beforeFolderId) : -1;
  dst.folders.splice(bi === -1 ? dst.folders.length : bi, 0, folder);
  const repoint = (loc: RequestLocation): RequestLocation | null => {
    const idx = loc.folderIds.indexOf(fid);
    if (idx === -1) return null;
    return {
      collectionId: to.collectionId,
      folderIds: [...to.folderIds, ...loc.folderIds.slice(idx)],
    };
  };
  for (const t of wb.tabs) {
    if (t.requestLocation) t.requestLocation = repoint(t.requestLocation) ?? t.requestLocation;
    if (t.kind === "container" && t.containerLoc) {
      t.containerLoc = repoint(t.containerLoc) ?? t.containerLoc;
    }
  }
  void persist();
}
