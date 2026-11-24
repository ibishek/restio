<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import {
    wb,
    selectTab,
    requestCloseTab,
    requestCloseOthers,
    closeUneditedTabs,
    duplicateTab,
    newTab,
    tabTitle,
    isTabDirty,
    methodColor,
    requestLabel,
  } from "./state.svelte";

  // Right-click context menu, anchored at the cursor.
  let menu = $state<{ id: string; x: number; y: number } | null>(null);

  function openMenu(e: MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    menu = { id, x: e.clientX, y: e.clientY };
  }
  const closeMenu = () => (menu = null);

  function act(fn: () => void) {
    fn();
    menu = null;
  }
</script>

<svelte:window onclick={closeMenu} onkeydown={(e) => e.key === "Escape" && closeMenu()} />

<div class="flex h-9 shrink-0 items-stretch border-b border-line bg-panel/40" role="tablist">
  <div class="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden">
    {#each wb.tabs as t (t.id)}
      {@const active = t.id === wb.activeTabId}
      <!-- Right-click opens the tab menu — a pointer enhancement; the tab and
           close buttons inside remain keyboard-accessible. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="group/tab relative flex max-w-tab shrink-0 items-center border-r border-line pr-1 pl-3 text-13 transition-colors {active
          ? 'bg-panel text-ink'
          : 'text-ink-muted hover:bg-panel-2/50'}"
        oncontextmenu={(e) => openMenu(e, t.id)}
      >
        <button
          role="tab"
          aria-selected={active}
          onclick={() => selectTab(t.id)}
          class="flex min-w-0 items-center gap-1.5 py-2 pr-1"
        >
          {#if t.kind === "container"}
            <Icon
              name={(t.containerLoc?.folderIds.length ?? 0) === 0 ? "layers" : "folder"}
              size={13}
              class="shrink-0 text-ink-faint"
            />
          {:else}
            {@const lbl = requestLabel(t.request)}
            <span class="shrink-0 text-10 font-bold tracking-wider {methodColor(lbl)}">
              {lbl}
            </span>
          {/if}
          <span class="min-w-0 truncate {t.kind === 'request' && t.request.deprecated ? 'text-ink-faint line-through' : ''}">
            {tabTitle(t)}
          </span>
          {#if isTabDirty(t)}
            <span class="size-1.5 shrink-0 rounded-full bg-ink-muted" title="Unsaved changes"></span>
          {/if}
        </button>
        {#if t.sending}
          <span class="mr-1 size-1.5 shrink-0 animate-pulse rounded-full bg-warn" title="Sending…"></span>
        {/if}
        <button
          onclick={(e) => {
            e.stopPropagation();
            requestCloseTab(t.id);
          }}
          aria-label="Close tab"
          title="Close tab"
          class="grid size-5 shrink-0 place-items-center rounded text-ink-faint transition-opacity hover:bg-panel-2 hover:text-ink {active
            ? 'opacity-100'
            : 'opacity-0 group-hover/tab:opacity-100'}"
        >
          <Icon name="x" size={13} />
        </button>
        {#if active}
          <span class="absolute inset-x-0 -bottom-px h-0.5 bg-brand"></span>
        {/if}
      </div>
    {/each}
  </div>
  <button
    onclick={newTab}
    aria-label="New tab"
    title="New request (⌘N)"
    class="grid w-9 shrink-0 place-items-center border-l border-line text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
  >
    <Icon name="plus" size={15} />
  </button>
</div>

{#if menu}
  {@const menuId = menu.id}
  <ul
    role="menu"
    style="position: fixed; left: {menu.x}px; top: {menu.y}px"
    class="z-40 w-48 overflow-hidden rounded-lg border border-line bg-panel py-1 text-13 shadow-2xl shadow-black/40"
  >
    <li role="none">
      <button
        role="menuitem"
        onclick={() => act(() => duplicateTab(menuId))}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Icon name="copy" size={13} /> Duplicate tab
      </button>
    </li>
    <li role="none">
      <button
        role="menuitem"
        onclick={() => act(() => requestCloseTab(menuId))}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Icon name="x" size={13} /> Close this tab
      </button>
    </li>
    <li role="none">
      <button
        role="menuitem"
        disabled={wb.tabs.length <= 1}
        onclick={() => act(() => requestCloseOthers(menuId))}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
      >
        <Icon name="x" size={13} /> Close other tabs
      </button>
    </li>
    <li role="none">
      <button
        role="menuitem"
        onclick={() => act(closeUneditedTabs)}
        class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Icon name="check" size={13} /> Close unedited tabs
      </button>
    </li>
  </ul>
{/if}
