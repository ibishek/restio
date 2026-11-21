<script lang="ts">
  import { browser } from "$app/env";
  import Icon from "#lib/components/ui/Icon.svelte";
  import { toast } from "#lib/components/ui/toasts.svelte";
  import type { HttpMethod } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import {
    filterPaletteItems,
    flattenRequests,
    type PaletteItem,
  } from "#lib/utils/search";
  import {
    addSseHeadersToActive,
    closeCommandPalette,
    createCollection,
    loadRequest,
    methodColor,
    newRequest,
    newSseRequest,
    openCookieManager,
    openRunner,
    paletteState,
    saveCurrentRequest,
    selectEnvironment,
    send,
    statusTone,
    switchWorkspace,
    toggleSidebar,
    wb,
  } from "./state.svelte";
  import { clearCookies } from "#lib/ipc";
  import { manualCheckForUpdates } from "./stores/updater.svelte";

  let {
    onOpenEnvEditor,
    onOpenWsManager,
    onOpenShare,
    onOpenShortcuts,
    onOpenPostmanImport,
    onOpenOpenApiImport,
  }: {
    onOpenEnvEditor?: () => void;
    onOpenWsManager?: () => void;
    onOpenShare?: () => void;
    onOpenShortcuts?: () => void;
    onOpenPostmanImport?: () => void;
    onOpenOpenApiImport?: () => void;
  } = $props();

  const isMac = browser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  let query = $state("");
  let selectedIndex = $state(0);
  let searchInput: HTMLInputElement | undefined = $state();
  let listContainer: HTMLUListElement | undefined = $state();
  let modalEl: HTMLDivElement | undefined = $state();
  let previousActiveEl: HTMLElement | null = null;

  const FILTERS = [
    { prefix: ">", label: "> Commands" },
    { prefix: "/", label: "/ Requests" },
    { prefix: "hist:", label: "hist: History" },
    { prefix: "env:", label: "env: Envs" },
    { prefix: "ws:", label: "ws: Workspaces" },
  ];

  // Focus input whenever palette is opened and track previously focused element
  $effect(() => {
    if (paletteState.open) {
      previousActiveEl = document.activeElement as HTMLElement | null;
      selectedIndex = 0;
      query = "";
      setTimeout(() => {
        searchInput?.focus({ preventScroll: true });
      }, 30);
    } else {
      if (previousActiveEl && typeof previousActiveEl.focus === "function") {
        previousActiveEl.focus();
        previousActiveEl = null;
      }
    }
  });

  // Reset selected index on query change
  $effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    query;
    selectedIndex = 0;
  });

  function close() {
    closeCommandPalette();
    query = "";
  }

  function executeItem(item: PaletteItem) {
    close();
    void item.action();
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

  // Build the complete list of candidate items reactively
  const allItems = $derived.by<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];

    // 1. Core Commands
    items.push(
      {
        id: "cmd-new-request",
        category: "commands",
        title: "New request",
        subtitle: "Create a fresh request tab",
        icon: "plus",
        shortcut: [mod, "N"],
        keywords: ["new", "tab", "create", "http"],
        action: () => newRequest(),
      },
      {
        id: "cmd-new-sse-request",
        category: "commands",
        title: "New SSE / stream request",
        subtitle: "Create a request pre-configured with text/event-stream headers",
        icon: "zap",
        keywords: ["sse", "stream", "streaming", "eventsource", "llm", "event-stream", "new"],
        action: () => newSseRequest(),
      },
      {
        id: "cmd-add-sse-headers",
        category: "commands",
        title: "Add SSE streaming headers",
        subtitle: "Add Accept: text/event-stream to active request",
        icon: "zap",
        keywords: ["sse", "stream", "header", "event-stream", "text/event-stream", "accept"],
        action: () => addSseHeadersToActive(),
      },
      {
        id: "cmd-manage-cookies",
        category: "commands",
        title: "Manage cookies",
        subtitle: "Inspect, edit, or purge cookies in the active workspace cookie jar",
        icon: "database",
        keywords: ["cookie", "cookies", "jar", "session", "auth", "token", "manage"],
        action: () => openCookieManager(),
      },
      {
        id: "cmd-clear-workspace-cookies",
        category: "commands",
        title: "Clear all workspace cookies",
        subtitle: "Purge all stored cookies across all domains for the current workspace",
        icon: "trash",
        keywords: ["cookie", "cookies", "purge", "clear", "delete", "session", "reset"],
        action: async () => {
          await clearCookies();
          toast.success("Workspace cookie jar cleared");
        },
      },
      {
        id: "cmd-send-request",
        category: "commands",
        title: "Send current request",
        subtitle: "Execute active tab request via Rust HTTP engine",
        icon: "send",
        shortcut: [mod, "↵"],
        keywords: ["send", "run", "execute", "dispatch"],
        action: () => void send(),
      },
      {
        id: "cmd-save-request",
        category: "commands",
        title: "Save request",
        subtitle: "Commit active request changes to collection",
        icon: "check",
        shortcut: [mod, "S"],
        keywords: ["save", "commit"],
        action: () => {
          saveCurrentRequest();
        },
      },
      {
        id: "cmd-new-collection",
        category: "commands",
        title: "New collection",
        subtitle: "Create a new container for organizing requests",
        icon: "folder",
        keywords: ["collection", "folder", "create"],
        action: () => createCollection(),
      },
      {
        id: "cmd-run-collection",
        category: "commands",
        title: "Run automated test suite",
        subtitle: "Launch collection runner to execute requests sequentially",
        icon: "send",
        keywords: ["runner", "test", "suite", "batch", "collection"],
        action: () => {
          if (wb.collections.length > 0) {
            openRunner({ collectionId: wb.collections[0].id, folderIds: [] });
          } else {
            toast.warn("No collections available to run");
          }
        },
      },
      {
        id: "cmd-import-openapi",
        category: "commands",
        title: "Import OpenAPI / Swagger",
        subtitle: "Import OpenAPI 3.0/3.1 or Swagger 2.0 (YAML/JSON)",
        icon: "file",
        keywords: ["openapi", "swagger", "import", "spec", "yaml", "json"],
        action: () => onOpenOpenApiImport?.(),
      },
      {
        id: "cmd-import-postman",
        category: "commands",
        title: "Import Postman collection",
        subtitle: "Import Postman v2.1 collections and tests",
        icon: "upload",
        keywords: ["postman", "import", "collection"],
        action: () => onOpenPostmanImport?.(),
      },
      {
        id: "cmd-manage-envs",
        category: "commands",
        title: "Manage environments",
        subtitle: "Configure environment variables and secrets",
        icon: "settings",
        keywords: ["environment", "variables", "secrets", "env"],
        action: () => onOpenEnvEditor?.(),
      },
      {
        id: "cmd-manage-workspaces",
        category: "commands",
        title: "Manage workspaces",
        subtitle: "Switch, create, or organize workspaces",
        icon: "layers",
        keywords: ["workspace", "switch"],
        action: () => onOpenWsManager?.(),
      },
      {
        id: "cmd-share-workspace",
        category: "commands",
        title: "Git Share & Collaborate",
        subtitle: "Sync collections across machines and teams via Git",
        icon: "git-branch",
        keywords: ["git", "share", "sync", "team", "push", "pull"],
        action: () => onOpenShare?.(),
      },
      {
        id: "cmd-toggle-sidebar",
        category: "commands",
        title: "Toggle sidebar",
        subtitle: "Show or hide the collections sidebar",
        icon: "panel-left",
        shortcut: [mod, "B"],
        keywords: ["sidebar", "hide", "show", "toggle"],
        action: () => toggleSidebar(),
      },
      {
        id: "cmd-shortcuts",
        category: "commands",
        title: "Keyboard shortcuts",
        subtitle: "View full keyboard reference cheat sheet",
        icon: "keyboard",
        shortcut: ["?"],
        keywords: ["help", "shortcuts", "keys", "hotkeys"],
        action: () => onOpenShortcuts?.(),
      },
      {
        id: "cmd-check-updates",
        category: "commands",
        title: "Check for updates",
        subtitle: "Check GitHub for new RestIO releases",
        icon: "download",
        keywords: ["update", "version", "upgrade", "check", "releases"],
        action: () => void manualCheckForUpdates(),
      },
    );

    // 2. All Collection Requests (Flattened)
    const flattened = flattenRequests(wb.collections);
    for (const f of flattened) {
      items.push({
        id: `req-${f.req.id}`,
        category: "requests",
        title: f.req.name || f.req.url,
        subtitle: `${f.trail} · ${f.req.url || "(no url)"}`,
        method: f.req.method,
        badge: f.req.method,
        badgeTone: "method",
        keywords: [f.req.method, f.req.url, f.trail],
        action: () => loadRequest(f.req, f.loc),
      });
    }

    // 3. Request History
    for (const h of wb.history) {
      items.push({
        id: `hist-${h.id}`,
        category: "history",
        title: h.request.name || h.request.url,
        subtitle: `${h.request.url} · ${h.ok ? `${h.status} OK` : "Error"} · ${h.timeMs}ms · ${relTime(h.at)}`,
        method: h.request.method,
        badge: h.ok ? String(h.status) : "ERR",
        badgeTone: "status",
        statusCode: h.status ?? undefined,
        keywords: [h.request.method, h.request.url, String(h.status)],
        action: () => loadRequest(h.request),
      });
    }

    // 4. Environments
    for (const env of wb.environments) {
      const isActive = env.id === wb.activeEnvId;
      items.push({
        id: `env-${env.id}`,
        category: "environments",
        title: env.name,
        subtitle: `${env.variables.length} variable${env.variables.length === 1 ? "" : "s"}${isActive ? " · Currently active" : ""}`,
        badge: isActive ? "Active" : undefined,
        badgeTone: "brand",
        icon: "settings",
        keywords: ["env", "environment", env.name],
        action: () => {
          selectEnvironment(env.id);
          toast.info(`Switched environment to ${env.name}`);
        },
      });
    }
    // "No environment" option
    items.push({
      id: "env-none",
      category: "environments",
      title: "No environment",
      subtitle: "Clear active environment variables",
      badge: wb.activeEnvId === null ? "Active" : undefined,
      badgeTone: "neutral",
      icon: "settings",
      keywords: ["env", "none", "clear"],
      action: () => {
        selectEnvironment(null);
        toast.info("Cleared active environment");
      },
    });

    // 5. Workspaces
    for (const ws of wb.workspaces) {
      const isActive = ws.id === wb.activeWorkspaceId;
      items.push({
        id: `ws-${ws.id}`,
        category: "workspaces",
        title: ws.name,
        subtitle: isActive ? "Currently active workspace" : "Switch active workspace",
        badge: isActive ? "Active" : undefined,
        badgeTone: "brand",
        icon: "layers",
        keywords: ["workspace", "ws", ws.name],
        action: () => {
          switchWorkspace(ws.id);
          toast.info(`Switched to workspace: ${ws.name}`);
        },
      });
    }

    return items;
  });

  const filteredItems = $derived(filterPaletteItems(allItems, query));

  function getFocusableElements(): HTMLElement[] {
    if (!modalEl) return [];
    return Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
  }

  function handleTab(e: KeyboardEvent) {
    const focusables = getFocusableElements();
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !modalEl?.contains(active)) {
        e.preventDefault();
        last.focus();
        scrollActiveItemIntoView();
      }
    } else {
      if (active === last || !modalEl?.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onWindowFocusIn(e: FocusEvent) {
    if (!paletteState.open || !modalEl) return;
    if (!modalEl.contains(e.target as Node)) {
      e.preventDefault();
      searchInput?.focus();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!paletteState.open) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "Tab") {
      handleTab(e);
      return;
    }

    if (filteredItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredItems.length;
      scrollActiveItemIntoView();
      const el = listContainer?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      el?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
      scrollActiveItemIntoView();
      const el = listContainer?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      el?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) executeItem(item);
    } else if (
      document.activeElement !== searchInput &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      searchInput?.focus();
    }
  }

  function scrollActiveItemIntoView() {
    requestAnimationFrame(() => {
      const activeEl = listContainer?.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
      activeEl?.scrollIntoView({ block: "nearest" });
    });
  }

  function setPrefix(prefix: string) {
    if (query.trimStart().startsWith(prefix)) {
      query = "";
    } else {
      query = prefix + " ";
    }
    searchInput?.focus();
  }
</script>

<svelte:window
  onkeydown={paletteState.open ? onKeydown : undefined}
  onfocusin={paletteState.open ? onWindowFocusIn : undefined}
/>

{#if paletteState.open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[10vh] p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <!-- Modal container -->
    <div
      bind:this={modalEl}
      use:focusTrap
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      class="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60 ring-1 ring-black/40"
    >
      <!-- Search input header -->
      <div class="flex h-11 shrink-0 items-center gap-2.5 border-b border-line/70 px-3.5">
        <Icon name="search" size={15} class="shrink-0 text-ink-faint" />
        <input
          bind:this={searchInput}
          bind:value={query}
          type="text"
          placeholder="Search requests, commands, history…"
          spellcheck="false"
          class="min-w-0 flex-1 bg-transparent text-13 text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {#if query}
          <button
            type="button"
            onclick={() => (query = "")}
            aria-label="Clear search"
            class="grid size-5.5 place-items-center rounded text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <Icon name="x" size={13} />
          </button>
        {/if}
        <kbd
          class="flex items-center rounded border border-line bg-panel-2/60 px-1.5 py-0.5 font-mono text-10 text-ink-faint select-none"
        >
          ESC
        </kbd>
      </div>

      <!-- Quick category filter chips -->
      <div
        class="flex items-center gap-1.5 overflow-x-auto border-b border-line/60 bg-panel-2/20 px-3.5 py-1.5 text-11 scrollbar-none"
      >
        <span class="mr-1 shrink-0 text-10 font-medium text-ink-faint uppercase select-none">Filter:</span>
        {#each FILTERS as f (f.prefix)}
          {@const isActive = query.trimStart().startsWith(f.prefix)}
          <button
            type="button"
            onclick={() => setPrefix(f.prefix)}
            class="shrink-0 rounded-md border px-2 py-0.5 font-mono text-10 transition-colors {isActive
              ? 'border-brand/50 bg-brand/12 text-brand font-semibold shadow-xs'
              : 'border-line/70 bg-panel/80 text-ink-muted hover:border-line-strong hover:bg-panel-2 hover:text-ink'}"
          >
            {f.label}
          </button>
        {/each}
      </div>

      <!-- Result list -->
      <ul
        bind:this={listContainer}
        role="listbox"
        class="min-h-0 flex-1 overflow-y-auto px-2 pt-1.5 pb-3 space-y-0.5 scroll-pb-3 scroll-pt-2"
      >
        {#each filteredItems as item, idx (item.id)}
          {@const isSelected = idx === selectedIndex}
          <li role="option" aria-selected={isSelected}>
            <button
              data-index={idx}
              onclick={() => executeItem(item)}
              onmouseenter={() => (selectedIndex = idx)}
              onfocus={() => {
                selectedIndex = idx;
                scrollActiveItemIntoView();
              }}
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors {isSelected
                ? 'bg-brand/10 text-ink ring-1 ring-inset ring-brand/35 shadow-xs'
                : 'text-ink-muted hover:bg-panel-2/70 hover:text-ink'}"
            >
              <!-- Icon or Method Badge -->
              {#if item.method}
                <span
                  class="w-11 shrink-0 text-center font-mono text-10 font-bold tracking-wider {methodColor(
                    item.method,
                  )}"
                >
                  {item.method}
                </span>
              {:else if item.statusCode !== undefined}
                <span
                  class="w-11 shrink-0 text-center font-mono text-10 font-bold tabular-nums {statusTone(
                    item.statusCode,
                  )}"
                >
                  {item.statusCode || "ERR"}
                </span>
              {:else if item.icon}
                <span class="grid size-6 shrink-0 place-items-center rounded text-ink-muted">
                  <Icon name={item.icon as any} size={15} />
                </span>
              {:else}
                <span class="grid size-6 shrink-0 place-items-center rounded text-ink-faint">
                  <Icon name="code" size={14} />
                </span>
              {/if}

              <!-- Title & Subtitle -->
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-13 font-medium text-ink">
                    {item.title}
                  </span>
                  {#if item.badge && !item.method}
                    <span
                      class="rounded px-1.5 py-0.2 font-mono text-9 font-semibold uppercase {item.badgeTone ===
                      'brand'
                        ? 'bg-brand/15 text-brand'
                        : 'bg-panel-2 text-ink-faint'}"
                    >
                      {item.badge}
                    </span>
                  {/if}
                </div>
                {#if item.subtitle}
                  <p class="truncate text-11 text-ink-faint">
                    {item.subtitle}
                  </p>
                {/if}
              </div>

              <!-- Shortcut Keys or Category Tag -->
              {#if item.shortcut && item.shortcut.length > 0}
                <span class="flex shrink-0 items-center gap-1">
                  {#each item.shortcut as key (key)}
                    <kbd
                      class="grid h-5 min-w-5 place-items-center rounded border border-line bg-panel-2/80 px-1 font-mono text-10 font-medium text-ink-muted shadow-sm"
                    >
                      {key}
                    </kbd>
                  {/each}
                </span>
              {:else}
                <span class="shrink-0 text-10 font-mono text-ink-faint opacity-50 uppercase">
                  {item.category}
                </span>
              {/if}
            </button>
          </li>
        {/each}

        {#if filteredItems.length === 0}
          <div class="flex flex-col items-center justify-center p-8 text-center">
            <Icon name="search" size={24} class="mb-2 text-ink-faint" />
            <p class="text-xs font-medium text-ink-muted">No results found for “{query}”</p>
            <p class="mt-1 text-11 text-ink-faint">
              Try searching with a different term, or prefix with &gt; for commands or / for requests.
            </p>
          </div>
        {/if}
      </ul>

      <!-- Footer navigation hints -->
      <div
        class="relative z-10 flex h-9 shrink-0 items-center justify-between border-t border-line bg-panel-2/90 px-3.5 text-11 text-ink-faint shadow-xs"
      >
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="rounded border border-line bg-panel px-1 text-9 font-semibold">↑↓</kbd>
            <span>navigate</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="rounded border border-line bg-panel px-1 text-9 font-semibold">↵</kbd>
            <span>select</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="rounded border border-line bg-panel px-1 text-9 font-semibold">esc</kbd>
            <span>close</span>
          </span>
        </div>
        <span class="font-mono text-10">
          {filteredItems.length} result{filteredItems.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  </div>
{/if}
