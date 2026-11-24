<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { Collection, Folder, HttpRequest } from "#lib/types";
  import {
    wb,
    activeTab,
    methodColor,
    requestLabel,
    statusTone,
    loadRequest,
    clearHistory,
    removeHistoryEntry,
    createCollection,
    addFolder,
    addRequestTo,
    deleteContainer,
    requestDeleteRequest,
    openContainerSettings,
    moveRequest,
    moveFolder,
    wouldCycle,
    setFolderDeprecated,
    openRunner,
    type RequestLocation,
  } from "./state.svelte";

  type View = "collections" | "history";
  let view = $state<View>("collections");
  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();

  // ⌘K bumps wb.searchNonce; focus + select the search box in response.
  $effect(() => {
    if (wb.searchNonce > 0) {
      searchInput?.focus();
      searchInput?.select();
    }
  });
  let openMenu = $state<string | null>(null); // id of the node whose ⋯ menu is open
  let headerMenu = $state(false); // the "+" (add collection / import) menu
  let postmanOpen = $state(false);
  let postmanMode = $state<"import" | "export">("import");
  let postmanCollection = $state<Collection | null>(null);

  let openApiOpen = $state(false);
  let openApiMode = $state<"import" | "export">("import");
  let openApiCollection = $state<Collection | null>(null);

  function openImport() {
    headerMenu = false;
    postmanMode = "import";
    postmanCollection = null;
    postmanOpen = true;
  }
  function openExport(c: Collection) {
    openMenu = null;
    postmanMode = "export";
    postmanCollection = c;
    postmanOpen = true;
  }

  function openOpenApiImport() {
    headerMenu = false;
    openApiMode = "import";
    openApiCollection = null;
    openApiOpen = true;
  }
  function openOpenApiExport(c: Collection) {
    openMenu = null;
    openApiMode = "export";
    openApiCollection = c;
    openApiOpen = true;
  }

  // ── Drag & drop (move requests/folders around the tree) ──────────────────────
  interface Drag {
    kind: "request" | "folder";
    loc: RequestLocation; // request's container, or the folder's own location
    id: string;
  }
  let dragged = $state<Drag | null>(null);
  let dropTarget = $state<string | null>(null); // id of the node currently hovered
  // For a folder header: "before" = reorder as a sibling (insert above this folder
  // in its parent); "into" = nest inside this folder. Chosen by pointer position.
  let dropEdge = $state<"before" | "into">("into");

  /** May the current drag be dropped onto container `targetLoc`? (Blocks folder
   *  cycles; everything else is allowed.) */
  function canDrop(targetLoc: RequestLocation): boolean {
    if (!dragged) return false;
    if (dragged.kind === "folder") return !wouldCycle(dragged.loc, targetLoc);
    return true;
  }

  function canDrop2(d: Drag, targetLoc: RequestLocation): boolean {
    return d.kind !== "folder" || !wouldCycle(d.loc, targetLoc);
  }

  function parentOf(folderLoc: RequestLocation): RequestLocation {
    return {
      collectionId: folderLoc.collectionId,
      folderIds: folderLoc.folderIds.slice(0, -1),
    };
  }

  function onDragStart(e: DragEvent, d: Drag) {
    dragged = d;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", d.id); // required to start a drag in some browsers
    }
  }

  function onDragOver(e: DragEvent, targetLoc: RequestLocation, targetId: string) {
    if (!canDrop(targetLoc)) return; // not preventing default → shows "no drop"
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTarget = targetId;
    dropEdge = "into"; // only folder headers use "before"; reset for containers/requests
  }

  function dropInto(e: DragEvent, targetLoc: RequestLocation, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const d = dragged;
    dragged = null;
    dropTarget = null;
    if (!d || !canDrop2(d, targetLoc)) return;
    if (d.kind === "request") moveRequest(d.loc, d.id, targetLoc);
    else moveFolder(d.loc, targetLoc);
    wb.expanded[targetId] = true;
  }

  function dropBeforeRequest(e: DragEvent, containerLoc: RequestLocation, beforeReqId: string) {
    e.preventDefault();
    e.stopPropagation();
    const d = dragged;
    dragged = null;
    dropTarget = null;
    if (!d || d.id === beforeReqId || !canDrop2(d, containerLoc)) return;
    if (d.kind === "request") moveRequest(d.loc, d.id, containerLoc, beforeReqId);
    else moveFolder(d.loc, containerLoc);
  }

  /** Dragover on a folder header: the top ~40% is a sibling-reorder zone (only for
   *  a dragged folder), the rest nests into the folder. */
  function onFolderDragOver(e: DragEvent, folderLoc: RequestLocation, folderId: string) {
    if (!dragged) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const inTopZone = dragged.kind === "folder" && e.clientY - rect.top < rect.height * 0.4;
    const targetLoc = inTopZone ? parentOf(folderLoc) : folderLoc;
    if (!canDrop(targetLoc)) return; // not preventing default → shows "no drop"
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    dropTarget = folderId;
    dropEdge = inTopZone ? "before" : "into";
  }

  function onFolderDrop(e: DragEvent, folderLoc: RequestLocation, folderId: string) {
    e.preventDefault();
    e.stopPropagation();
    const d = dragged;
    const edge = dropEdge;
    dragged = null;
    dropTarget = null;
    dropEdge = "into";
    if (!d) return;
    if (edge === "before" && d.kind === "folder") {
      moveFolder(d.loc, parentOf(folderLoc), folderId); // insert before this sibling
    } else if (canDrop2(d, folderLoc)) {
      if (d.kind === "request") moveRequest(d.loc, d.id, folderLoc);
      else moveFolder(d.loc, folderLoc);
      wb.expanded[folderId] = true;
    }
  }

  function endDrag() {
    dragged = null;
    dropTarget = null;
    dropEdge = "into";
  }

  const collectionLoc = (c: Collection): RequestLocation => ({ collectionId: c.id, folderIds: [] });
  const childLoc = (loc: RequestLocation, folderId: string): RequestLocation => ({
    collectionId: loc.collectionId,
    folderIds: [...loc.folderIds, folderId],
  });

  /** Total requests inside a node (recursive), for the count badge. */
  function countRequests(node: Collection | Folder): number {
    return node.requests.length + node.folders.reduce((n, f) => n + countRequests(f), 0);
  }

  // Flattened request list for search — searching a nested tree is clearer as a
  // flat result set than a pruned tree.
  interface Flat {
    req: HttpRequest;
    loc: RequestLocation;
    trail: string;
  }
  function flatten(cols: Collection[]): Flat[] {
    const out: Flat[] = [];
    const walk = (node: Collection | Folder, loc: RequestLocation, trail: string) => {
      for (const r of node.requests) out.push({ req: r, loc, trail });
      for (const f of node.folders) walk(f, childLoc(loc, f.id), `${trail} / ${f.name}`);
    };
    for (const c of cols) walk(c, collectionLoc(c), c.name);
    return out;
  }

  const q = $derived(query.trim().toLowerCase());
  const searchResults = $derived(
    q === ""
      ? []
      : flatten(wb.collections).filter(
          (f) => f.req.name.toLowerCase().includes(q) || f.req.url.toLowerCase().includes(q),
        ),
  );

  const filteredHistory = $derived(
    wb.history.filter(
      (h) =>
        h.request.name.toLowerCase().includes(q) || h.request.url.toLowerCase().includes(q),
    ),
  );

  function toggle(id: string) {
    wb.expanded[id] = !wb.expanded[id];
  }

  function menu(id: string, e: MouseEvent) {
    e.stopPropagation();
    openMenu = openMenu === id ? null : id;
  }

  function act(fn: () => void) {
    openMenu = null;
    fn();
  }

  /** Compact "time since" label — "now", "3m", "2h", "5d", else a date. */
  function relTime(at: number): string {
    const secs = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (secs < 10) return "now";
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Highlight the request open in the focused tab.
  const tab = $derived(activeTab());
  const isActive = (req: HttpRequest) => tab?.request.id === req.id;
</script>

<svelte:window
  onclick={() => {
    openMenu = null;
    headerMenu = false;
  }}
/>

<aside class="flex w-64 shrink-0 flex-col border-r border-line bg-panel/60 backdrop-blur-sm">
  <!-- View switcher -->
  <div class="flex items-center gap-1 px-3 pt-3 pb-2">
    <div class="flex flex-1 items-center gap-0.5 rounded-md bg-panel-2/60 p-0.5">
      <button
        onclick={() => (view = "collections")}
        class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors"
        class:bg-panel={view === "collections"}
        class:text-ink={view === "collections"}
        class:text-ink-muted={view !== "collections"}
      >
        <Icon name="layers" size={13} />
        Collections
      </button>
      <button
        onclick={() => (view = "history")}
        class="flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors"
        class:bg-panel={view === "history"}
        class:text-ink={view === "history"}
        class:text-ink-muted={view !== "history"}
      >
        <Icon name="history" size={13} />
        History
      </button>
    </div>
    {#if view === "collections"}
      <div class="relative">
        <button
          onclick={(e) => {
            e.stopPropagation();
            headerMenu = !headerMenu;
          }}
          aria-haspopup="menu"
          aria-expanded={headerMenu}
          class="grid size-7 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
          title="Add collection"
          aria-label="Add collection"
        >
          <Icon name="plus" size={16} />
        </button>
        {#if headerMenu}
          <ul
            role="menu"
            class="absolute top-8 right-0 z-30 w-52 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl shadow-black/40"
          >
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  headerMenu = false;
                  createCollection();
                }}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <Icon name="plus" size={14} /> New collection
              </button>
            </li>
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  openImport();
                }}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <Icon name="upload" size={14} /> Import Postman…
              </button>
            </li>
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  openOpenApiImport();
                }}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
              >
                <Icon name="file" size={14} /> Import OpenAPI / Swagger…
              </button>
            </li>
          </ul>
        {/if}
      </div>
    {:else}
      <button
        onclick={clearHistory}
        disabled={wb.history.length === 0}
        class="grid size-7 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
        title="Clear history"
        aria-label="Clear history"
      >
        <Icon name="trash" size={15} />
      </button>
    {/if}
  </div>

  <div class="px-3 pb-2">
    <div class="relative">
      <span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint">
        <Icon name="search" size={14} />
      </span>
      <input
        bind:this={searchInput}
        bind:value={query}
        type="text"
        placeholder={view === "collections" ? "Search requests" : "Search history"}
        class="w-full rounded-md border border-line bg-panel-2/70 py-1.5 pr-2 pl-8 text-sm text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
      />
    </div>
  </div>

  {#if view === "collections"}
    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {#if q !== ""}
        <!-- Search results (flat) -->
        {#each searchResults as r (r.req.id)}
          {@const lbl = requestLabel(r.req)}
          <button
            onclick={() => loadRequest(r.req, r.loc)}
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-panel-2"
            class:bg-panel-2={isActive(r.req)}
          >
            <span class="w-11 shrink-0 text-10 font-bold tracking-wider {methodColor(lbl)}">
              {lbl}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-13 {r.req.deprecated ? 'text-ink-faint line-through' : 'text-ink-muted'}">
                {r.req.name}
              </span>
              <span class="block truncate text-10 text-ink-faint">{r.trail}</span>
            </span>
          </button>
        {/each}
        {#if searchResults.length === 0}
          <p class="px-3 py-6 text-center text-xs text-ink-faint">No requests match “{query}”.</p>
        {/if}
      {:else}
        {#each wb.collections as collection (collection.id)}
          {@render container(collection, collectionLoc(collection), true, 0)}
        {/each}
        {#if wb.collections.length === 0}
          <p class="px-3 py-6 text-center text-xs text-ink-faint">
            No collections yet. Use + to create one.
          </p>
        {/if}
      {/if}
    </nav>
  {:else}
    <nav class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      {#each filteredHistory as h (h.id)}
        {@const lbl = requestLabel(h.request)}
        <div class="group relative">
          <button
            onclick={() => loadRequest(h.request)}
            class="flex w-full items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-left transition-colors hover:bg-panel-2"
          >
            <span class="w-11 shrink-0 text-10 font-bold tracking-wider {methodColor(lbl)}">
              {lbl}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-13 text-ink-muted">
                {h.request.name || h.request.url}
              </span>
              <span class="mt-0.5 flex items-center gap-1.5 text-11 text-ink-faint">
                {#if h.ok}
                  <span class="font-semibold tabular-nums {statusTone(h.status ?? 0)}">{h.status}</span>
                {:else}
                  <span class="font-semibold text-danger">error</span>
                {/if}
                {#if h.ok}
                  <span class="tabular-nums">{h.timeMs} ms</span>
                {/if}
                <span class="ml-auto tabular-nums">{relTime(h.at)}</span>
              </span>
            </span>
          </button>
          <button
            onclick={() => removeHistoryEntry(h.id)}
            aria-label="Remove from history"
            class="absolute top-1.5 right-1 grid size-6 place-items-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      {/each}

      {#if wb.history.length === 0}
        <div class="flex flex-col items-center gap-2 px-3 py-10 text-center">
          <Icon name="history" size={22} class="text-ink-faint" />
          <p class="text-xs text-ink-faint">Sent requests will appear here. Nothing yet.</p>
        </div>
      {:else if filteredHistory.length === 0}
        <p class="px-3 py-6 text-center text-xs text-ink-faint">No history matches “{query}”.</p>
      {/if}
    </nav>
  {/if}
</aside>

{#if postmanOpen}
  {#await import("./PostmanDialog.svelte") then { default: PostmanDialog }}
    <PostmanDialog bind:open={postmanOpen} mode={postmanMode} collection={postmanCollection} />
  {/await}
{/if}

{#if openApiOpen}
  {#await import("./OpenApiDialog.svelte") then { default: OpenApiDialog }}
    <OpenApiDialog bind:open={openApiOpen} mode={openApiMode} collection={openApiCollection} />
  {/await}
{/if}

<!-- A collection or folder node (recursive). -->
{#snippet container(node: Collection | Folder, loc: RequestLocation, isCollection: boolean, depth: number)}
  {@const open = wb.expanded[node.id]}
  <!-- The whole node (header + its body) is a "drop into this container" zone, so
       a request can be dragged out of a folder onto the collection's area. Inner
       folders / request rows claim priority via stopPropagation. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="rounded-md"
    ondragover={(e) => onDragOver(e, loc, node.id)}
    ondrop={(e) => dropInto(e, loc, node.id)}
    ondragend={endDrag}
  >
    <!-- Drag-to-move is a pointer enhancement; the row's real actions (expand,
         open, ⋯ menu) are keyboard-accessible <button>s inside. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="group relative flex items-center rounded-md transition-colors {dropTarget === node.id
        ? dropEdge === 'before'
          ? 'shadow-drop-indicator'
          : 'bg-brand/10 ring-1 ring-inset ring-brand/50'
        : 'hover:bg-panel-2'}"
      style="padding-left: {depth * 0.65}rem"
      draggable={!isCollection}
      ondragstart={(e) => {
        if (!isCollection) onDragStart(e, { kind: "folder", loc, id: node.id });
      }}
      ondragover={isCollection ? undefined : (e) => onFolderDragOver(e, loc, node.id)}
      ondrop={isCollection ? undefined : (e) => onFolderDrop(e, loc, node.id)}
    >
      <button
        onclick={() => toggle(node.id)}
        class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pr-1 pl-1 text-left text-sm font-medium text-ink"
      >
        <span class="text-ink-faint transition-transform duration-200" class:rotate-90={open}>
          <Icon name="chevron-right" size={14} />
        </span>
        <Icon name={isCollection ? "layers" : "folder"} size={15} class="shrink-0 text-ink-faint" />
        <span class="truncate {(node as Folder).deprecated ? 'text-ink-faint line-through' : ''}">
          {node.name}
        </span>
        {#if (node as Folder).deprecated}
          <span class="shrink-0 rounded bg-warn/15 px-1 text-9 font-medium tracking-wide text-warn uppercase">dep</span>
        {/if}
        <span class="text-11 tabular-nums text-ink-faint">{countRequests(node)}</span>
      </button>
      <button
        onclick={(e) => menu(node.id, e)}
        aria-label="Node actions"
        aria-haspopup="menu"
        class="mr-1 grid size-6 shrink-0 place-items-center rounded text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:bg-panel hover:text-ink focus-visible:opacity-100"
        class:opacity-100={openMenu === node.id}
      >
        <Icon name="grip" size={14} />
      </button>

      {#if openMenu === node.id}
        <ul
          role="menu"
          class="absolute top-8 right-1 z-30 w-44 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl shadow-black/40"
        >
          <li role="none">
            <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => openRunner(loc)); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
              <Icon name="send" size={14} /> Run {isCollection ? "collection" : "folder"}
            </button>
          </li>
          <li role="none" class="my-1 border-t border-line"></li>
          <li role="none">
            <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => addRequestTo(loc)); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
              <Icon name="plus" size={14} /> New request
            </button>
          </li>
          <li role="none">
            <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => { addFolder(loc); }); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
              <Icon name="folder" size={14} /> New folder
            </button>
          </li>
          <li role="none">
            <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => openContainerSettings(loc)); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
              <Icon name="settings" size={14} /> Rename
            </button>
          </li>
          {#if isCollection}
            <li role="none">
              <button role="menuitem" onclick={(e) => { e.stopPropagation(); openExport(node as Collection); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
                <Icon name="download" size={14} /> Export (Postman)
              </button>
            </li>
            <li role="none">
              <button role="menuitem" onclick={(e) => { e.stopPropagation(); openOpenApiExport(node as Collection); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
                <Icon name="file" size={14} /> Export (OpenAPI)
              </button>
            </li>
          {:else}
            <li role="none">
              <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => setFolderDeprecated(loc, !(node as Folder).deprecated)); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink">
                <Icon name="alert-triangle" size={14} /> {(node as Folder).deprecated ? "Clear deprecated" : "Mark deprecated"}
              </button>
            </li>
          {/if}
          <li role="none" class="my-1 border-t border-line"></li>
          <li role="none">
            <button role="menuitem" onclick={(e) => { e.stopPropagation(); act(() => deleteContainer(loc)); }} class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-danger/15 hover:text-danger">
              <Icon name="trash" size={14} /> Delete {isCollection ? "collection" : "folder"}
            </button>
          </li>
        </ul>
      {/if}
    </div>

    {#if open}
      <div class="border-l border-line" style="margin-left: {depth * 0.65 + 0.9}rem">
        {#each node.folders as f (f.id)}
          {@render container(f, childLoc(loc, f.id), false, depth + 1)}
        {/each}
        <ul class="space-y-0.5">
          {#each node.requests as req (req.id)}
            {@const lbl = requestLabel(req)}
            <li
              class="group/req relative rounded-md {dropTarget === req.id
                ? 'bg-brand/10 ring-1 ring-inset ring-brand/50'
                : ''}"
              draggable="true"
              ondragstart={(e) => onDragStart(e, { kind: "request", loc, id: req.id })}
              ondragover={(e) => onDragOver(e, loc, req.id)}
              ondrop={(e) => dropBeforeRequest(e, loc, req.id)}
              ondragend={endDrag}
            >
              <button
                onclick={() => loadRequest(req, loc)}
                class="flex w-full items-center gap-2 rounded-md py-1.5 pr-7 pl-2 text-left transition-colors hover:bg-panel-2"
                class:bg-panel-2={isActive(req)}
              >
                <span class="w-11 shrink-0 text-10 font-bold tracking-wider {methodColor(lbl)}">
                  {lbl}
                </span>
                <span class="truncate text-13 {req.deprecated ? 'text-ink-faint line-through' : 'text-ink-muted'}">
                  {req.name}
                </span>
                {#if req.deprecated}
                  <span class="shrink-0 rounded bg-warn/15 px-1 text-9 font-medium tracking-wide text-warn uppercase">dep</span>
                {/if}
              </button>
              <button
                onclick={() => requestDeleteRequest(loc, req.id)}
                aria-label="Delete request"
                class="absolute top-1.5 right-1 grid size-6 place-items-center rounded text-ink-faint opacity-0 transition-opacity group-hover/req:opacity-100 hover:bg-danger/15 hover:text-danger focus-visible:opacity-100"
              >
                <Icon name="trash" size={12} />
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/snippet}
