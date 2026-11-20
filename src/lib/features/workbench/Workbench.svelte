<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/env";
  import Icon from "#lib/components/ui/Icon.svelte";
  import Toaster from "#lib/components/ui/Toaster.svelte";
  import appIcon from "../../../../src-tauri/icons/128x128.png";
  import Sidebar from "./Sidebar.svelte";
  import RequestPanel from "./RequestPanel.svelte";
  import ResponsePanel from "./ResponsePanel.svelte";
  import ContainerEditor from "./ContainerEditor.svelte";
  import EnvironmentEditor from "./EnvironmentEditor.svelte";
  import WorkspaceManager from "./WorkspaceManager.svelte";
  import ShortcutsOverlay from "./ShortcutsOverlay.svelte";
  import TabStrip from "./TabStrip.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import CollectionRunnerDialog from "./CollectionRunnerDialog.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import { ShareDialog } from "#lib/features/sharing";
  import {
    wb,
    runnerState,
    paletteState,
    openCommandPalette,
    closeCommandPalette,
    activeTab,
    requestCloseTab,
    hasUnsavedTabs,
    initWorkbench,
    activeEnvName,
    selectEnvironment,
    reloadCollections,
    activeWorkspaceName,
    switchWorkspace,
    refreshMembers,
    send,
    cancel,
    saveCurrentRequest,
    newRequest,
    toggleSidebar,
    requestSearchFocus,
    statusTone,
  } from "./state.svelte";
  import { initUpdater, updater, openReleasePage } from "./stores/updater.svelte";
  import { humanBytes, humanMs } from "#lib/utils/format";

  onMount(async () => {
    if (browser) {
      try {
        const saved = localStorage.getItem("ag_workbench_split_percent");
        if (saved) {
          const val = parseFloat(saved);
          if (!isNaN(val) && val >= 15 && val <= 85) {
            splitPercent = val;
          }
        }
      } catch {
        // ignore
      }
    }
    try {
      await initWorkbench();
      void initUpdater();
    } catch (err) {
      console.error("Failed to initialize workbench:", err);
    }
  });

  const isMac = browser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  // The focused tab — drives the status bar (its response / send state).
  const tab = $derived(activeTab());

  let envOpen = $state(false);
  let editorOpen = $state(false);
  let shareOpen = $state(false);
  let wsOpen = $state(false);
  let wsManagerOpen = $state(false);
  let shortcutsOpen = $state(false);

  let splitPercent = $state(50);
  let splitContainer = $state<HTMLElement | undefined>();
  let isDraggingSplit = $state(false);

  function updateSplit(pct: number) {
    const clamped = Math.max(15, Math.min(85, Math.round(pct * 10) / 10));
    splitPercent = clamped;
    if (browser) {
      try {
        localStorage.setItem("ag_workbench_split_percent", clamped.toString());
      } catch {
        // ignore
      }
    }
  }

  function resetSplit() {
    updateSplit(50);
  }

  function onSplitterPointerDown(e: PointerEvent) {
    if (!splitContainer) return;
    e.preventDefault();
    isDraggingSplit = true;
    const container = splitContainer;

    const onPointerMove = (ev: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.height <= 0) return;
      const y = ev.clientY - rect.top;
      const pct = (y / rect.height) * 100;
      updateSplit(pct);
    };

    const onPointerUp = () => {
      isDraggingSplit = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function onSplitterKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      updateSplit(splitPercent - 2);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      updateSplit(splitPercent + 2);
    } else if (e.key === "Home") {
      e.preventDefault();
      updateSplit(15);
    } else if (e.key === "End") {
      e.preventDefault();
      updateSplit(85);
    } else if (e.key === "Enter") {
      e.preventDefault();
      resetSplit();
    }
  }

  const anyModalOpen = $derived(
    envOpen ||
      editorOpen ||
      shareOpen ||
      wsManagerOpen ||
      wsOpen ||
      shortcutsOpen ||
      runnerState.open ||
      paletteState.open,
  );

  function chooseEnv(id: string | null) {
    selectEnvironment(id);
    envOpen = false;
  }

  function manageEnvironments() {
    envOpen = false;
    editorOpen = true;
  }

  function chooseWorkspace(id: string) {
    switchWorkspace(id);
    wsOpen = false;
  }

  function manageWorkspaces() {
    wsOpen = false;
    wsManagerOpen = true;
  }

  function closeMenus() {
    envOpen = false;
    wsOpen = false;
  }

  function isTyping(e: KeyboardEvent): boolean {
    const el = e.target;
    return (
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    );
  }

  // Global keyboard shortcuts. Modifier combos work everywhere (including inside
  // inputs) so ⌘↵/⌘S fire while editing; bare keys only when not typing. Each
  // dialog owns its own Escape, so we skip editor combos while one is open.
  function onWindowKey(e: KeyboardEvent) {
    const isMod = e.metaKey || e.ctrlKey;

    if (isMod && !e.altKey) {
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (paletteState.open) closeCommandPalette();
        else openCommandPalette();
        return;
      }
    }

    if (isMod && !e.altKey && !anyModalOpen) {
      switch (e.key.toLowerCase()) {
        case "enter":
          e.preventDefault();
          void send();
          return;
        case "s":
          e.preventDefault();
          saveCurrentRequest();
          return;
        case "b":
          e.preventDefault();
          toggleSidebar();
          return;
        case "n":
          e.preventDefault();
          newRequest();
          return;
        case "w":
          e.preventDefault();
          if (wb.activeTabId) requestCloseTab(wb.activeTabId);
          return;
      }
    }

    if (e.key === "Escape") {
      if (paletteState.open) closeCommandPalette();
      else if (shortcutsOpen) shortcutsOpen = false;
      else if (tab?.sending) void cancel();
      closeMenus();
      return;
    }

    if (e.key === "?" && !isMod && !isTyping(e)) {
      e.preventDefault();
      shortcutsOpen = !shortcutsOpen;
    }
  }

  // After a Git clone/pull, refresh both the collections and the member list
  // (new commits may bring new contributors).
  async function afterSync() {
    await reloadCollections();
    await refreshMembers();
  }

  // Avatar tints, cycled by member index.
  const tones = ["bg-emerald-500/80", "bg-sky-500/80", "bg-violet-500/80", "bg-amber-500/80", "bg-rose-500/80"];
  const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase() : "?";
  };
</script>

<svelte:window onclick={closeMenus} onkeydown={onWindowKey} />

<div class="flex h-dvh flex-col overflow-hidden text-ink">
  <!-- Top bar -->
  <header
    class="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel/70 px-3 backdrop-blur"
  >
    <button
      onclick={toggleSidebar}
      aria-label={wb.sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      aria-pressed={wb.sidebarCollapsed}
      title="Toggle sidebar (⌘B)"
      class="grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-panel-2 hover:text-ink"
      class:text-ink={wb.sidebarCollapsed}
      class:text-ink-muted={!wb.sidebarCollapsed}
    >
      <Icon name="panel-left" size={16} />
    </button>

    <div class="flex items-center gap-2">
      <img
        src={appIcon}
        alt="RestIO"
        class="size-7 select-none object-contain drop-shadow-sm"
        width="28"
        height="28"
      />
      <span class="text-sm font-semibold tracking-tight">RestIO</span>
      {#if updater.updateAvailable && updater.latestVersion}
        <button
          onclick={openReleasePage}
          title="New version v{updater.latestVersion} available! Click to view release."
          class="flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 font-medium text-10 text-brand transition-colors hover:bg-brand/25"
        >
          <span class="size-1.5 animate-pulse rounded-full bg-brand"></span>
          <span>v{updater.latestVersion} available</span>
        </button>
      {:else}
        <span
          title="RestIO v{updater.currentVersion}"
          class="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-10 text-ink-faint select-none"
        >
          v{updater.currentVersion}
        </span>
      {/if}
    </div>

    <span class="mx-1 h-5 w-px bg-line"></span>

    <!-- Workspace switcher -->
    <div class="relative">
      <button
        onclick={(e) => {
          e.stopPropagation();
          wsOpen = !wsOpen;
        }}
        aria-haspopup="menu"
        aria-expanded={wsOpen}
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Icon name="layers" size={14} />
        {activeWorkspaceName()}
        <Icon name="chevron-down" size={13} class="text-ink-faint" />
      </button>

      {#if wsOpen}
        <ul
          role="menu"
          class="absolute left-0 z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl shadow-black/40"
        >
          {#each wb.workspaces as ws (ws.id)}
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  chooseWorkspace(ws.id);
                }}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-panel-2"
              >
                <Icon name="layers" size={13} class="text-ink-faint" />
                <span class="min-w-0 flex-1 truncate text-ink">{ws.name}</span>
                {#if ws.id === wb.activeWorkspaceId}
                  <span class="text-brand"><Icon name="check" size={14} /></span>
                {/if}
              </button>
            </li>
          {/each}
          <li role="none" class="my-1 border-t border-line"></li>
          <li role="none">
            <button
              role="menuitem"
              onclick={(e) => {
                e.stopPropagation();
                manageWorkspaces();
              }}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <Icon name="settings" size={14} />
              Manage workspaces…
            </button>
          </li>
        </ul>
      {/if}
    </div>

    <!-- Global Command Palette / Search Trigger -->
    <button
      type="button"
      onclick={openCommandPalette}
      class="flex h-8 w-64 items-center justify-between rounded-lg border border-line bg-panel-2/50 px-2.5 text-xs text-ink-muted transition-colors hover:border-line-strong hover:bg-panel-2 hover:text-ink focus-visible:outline-none"
      title="Global Search & Commands ({mod}K)"
    >
      <span class="flex items-center gap-2">
        <Icon name="search" size={13} class="text-ink-faint" />
        <span>Search or jump to…</span>
      </span>
      <kbd
        class="flex items-center rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-10 font-semibold text-ink-faint shadow-xs"
      >
        {mod}K
      </kbd>
    </button>

    <!-- Environment selector -->
    <div class="relative ml-auto">
      <button
        onclick={(e) => {
          e.stopPropagation();
          envOpen = !envOpen;
        }}
        aria-haspopup="menu"
        aria-expanded={envOpen}
        class="flex items-center gap-1.5 rounded-md border border-line bg-panel-2/60 px-2.5 py-1 text-sm transition-colors hover:border-line-strong"
      >
        <span
          class="size-2 rounded-full"
          class:bg-brand={wb.activeEnvId !== null}
          class:bg-line-strong={wb.activeEnvId === null}
        ></span>
        <span class="text-ink">{activeEnvName()}</span>
        <Icon name="chevron-down" size={13} class="text-ink-faint" />
      </button>

      {#if envOpen}
        <ul
          role="menu"
          class="absolute right-0 z-30 mt-1.5 w-56 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-2xl shadow-black/40"
        >
          {#each wb.environments as env (env.id)}
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  chooseEnv(env.id);
                }}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-panel-2"
              >
                <span class="size-2 shrink-0 rounded-full bg-brand"></span>
                <span class="min-w-0 flex-1 truncate text-ink">{env.name}</span>
                {#if env.id === wb.activeEnvId}
                  <span class="text-brand"><Icon name="check" size={14} /></span>
                {/if}
              </button>
            </li>
          {/each}
          <li role="none">
            <button
              role="menuitem"
              onclick={(e) => {
                e.stopPropagation();
                chooseEnv(null);
              }}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2"
            >
              <span class="size-2 shrink-0 rounded-full bg-line-strong"></span>
              <span class="min-w-0 flex-1 truncate">No environment</span>
              {#if wb.activeEnvId === null}
                <span class="text-brand"><Icon name="check" size={14} /></span>
              {/if}
            </button>
          </li>
          <li role="none" class="my-1 border-t border-line"></li>
          <li role="none">
            <button
              role="menuitem"
              onclick={(e) => {
                e.stopPropagation();
                manageEnvironments();
              }}
              class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <Icon name="settings" size={14} />
              Manage environments…
            </button>
          </li>
        </ul>
      {/if}
    </div>

    <!-- Workspace members (Git contributors) -->
    <div class="flex items-center">
      {#if wb.members.length > 0}
        <div class="flex -space-x-2">
          {#each wb.members.slice(0, 4) as m, i (m.email + m.name)}
            <span
              class="grid size-7 place-items-center rounded-full border-2 border-panel text-10 font-bold text-white {tones[
                i % tones.length
              ]}"
              title={`${m.name}${m.email ? ` <${m.email}>` : ""} · ${m.commits} ${m.commits === 1 ? "commit" : "commits"}`}
            >
              {initials(m.name)}
            </span>
          {/each}
          {#if wb.members.length > 4}
            <span
              class="grid size-7 place-items-center rounded-full border-2 border-panel bg-panel-2 text-10 font-bold text-ink-muted"
              title={`${wb.members.length - 4} more`}
            >
              +{wb.members.length - 4}
            </span>
          {/if}
        </div>
      {/if}
      <button
        onclick={() => (shareOpen = true)}
        class="ml-2 flex items-center gap-1.5 rounded-md bg-panel-2 px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
      >
        <Icon name="users" size={14} />
        Share
      </button>
    </div>
  </header>

  <!-- Body -->
  <div class="flex min-h-0 flex-1">
    {#if !wb.sidebarCollapsed}
      <Sidebar />
    {/if}

    <main class="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <TabStrip />
      {#if !tab}
        <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span class="grid size-14 place-items-center rounded-2xl bg-panel-2 text-ink-faint">
            <Icon name="send" size={26} />
          </span>
          <div class="space-y-1">
            <p class="text-sm font-medium text-ink">No open requests</p>
            <p class="text-13 text-ink-muted">Pick a request from the sidebar, or create a new one.</p>
          </div>
          <button
            onclick={newRequest}
            class="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-13 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name="plus" size={14} />
            New request
          </button>
        </div>
      {:else if tab.kind === "container"}
        <ContainerEditor />
      {:else}
        <div bind:this={splitContainer} class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div style="flex: 0 0 {splitPercent}%;" class="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <RequestPanel />
          </div>

          <!-- Draggable splitter divider -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            role="separator"
            tabindex="0"
            aria-orientation="horizontal"
            aria-label="Resize request and response panels"
            aria-valuenow={Math.round(splitPercent)}
            aria-valuemin={15}
            aria-valuemax={85}
            onpointerdown={onSplitterPointerDown}
            ondblclick={resetSplit}
            onkeydown={onSplitterKeydown}
            class="group relative z-10 flex h-2 shrink-0 -my-1 cursor-row-resize items-center justify-center select-none hover:bg-brand/10 focus:outline-none transition-colors"
          >
            <div class="h-px w-full bg-line group-hover:bg-brand group-focus-visible:bg-brand transition-colors"></div>
            <div class="absolute h-1 w-8 rounded-full bg-line-strong group-hover:bg-brand group-focus-visible:bg-brand transition-colors"></div>
          </div>

          <div style="flex: 1 1 0%;" class="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <ResponsePanel />
          </div>
        </div>
      {/if}
    </main>
  </div>

  <!-- Status bar — reflects real request state -->
  <footer
    class="flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel/70 px-3 text-11 text-ink-faint backdrop-blur"
  >
    {#if tab?.sending}
      <span class="flex items-center gap-1.5 text-warn">
        <span class="size-1.5 animate-pulse rounded-full bg-warn"></span>
        Sending…
      </span>
    {:else if tab && tab.error}
      <span class="flex items-center gap-1.5 text-danger" title={tab.error}>
        <span class="size-1.5 rounded-full bg-danger"></span>
        Request failed
      </span>
    {:else if tab && tab.response}
      <span class="flex items-center gap-1.5 font-medium {statusTone(tab.response.status)}">
        <span class="size-1.5 rounded-full bg-current"></span>
        {tab.response.status}
        {tab.response.statusText}
      </span>
      <span class="flex items-center gap-1 tabular-nums">
        <Icon name="clock" size={12} />
        {humanMs(tab.response.timeMs)}
      </span>
      <span class="tabular-nums">{humanBytes(tab.response.sizeBytes)}</span>
    {:else}
      <span class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-brand"></span>
        Ready
      </span>
    {/if}

    <span class="flex items-center gap-1">
      <Icon name="globe" size={12} />
      {activeEnvName()}
    </span>

    <span class="ml-auto flex items-center gap-3">
      <span class="tabular-nums">
        {wb.history.length}
        {wb.history.length === 1 ? "request" : "requests"}
      </span>
      <button
        onclick={() => (shortcutsOpen = true)}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        class="flex items-center gap-1 rounded px-1 transition-colors hover:text-ink"
      >
        <Icon name="keyboard" size={12} />
        Shortcuts
      </button>
    </span>
  </footer>
</div>

<EnvironmentEditor bind:open={editorOpen} />
<WorkspaceManager bind:open={wsManagerOpen} />
<ShareDialog bind:open={shareOpen} onSynced={afterSync} />
<ShortcutsOverlay bind:open={shortcutsOpen} />
<CollectionRunnerDialog />
<CommandPalette
  onOpenEnvEditor={() => (editorOpen = true)}
  onOpenWsManager={() => (wsManagerOpen = true)}
  onOpenShare={() => (shareOpen = true)}
  onOpenShortcuts={() => (shortcutsOpen = true)}
/>
{#if isDraggingSplit}
  <div class="fixed inset-0 z-overlay cursor-row-resize select-none"></div>
{/if}

<ConfirmDialog />
<Toaster />
