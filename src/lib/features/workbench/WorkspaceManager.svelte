<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { focusTrap } from "#lib/utils/focusTrap";
  import {
    wb,
    createWorkspace,
    renameWorkspace,
    deleteWorkspace,
    switchWorkspace,
  } from "./state.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  function close() {
    open = false;
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      use:focusTrap
      role="dialog"
      aria-modal="true"
      aria-labelledby="ws-title"
      class="flex max-h-modal w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Icon name="layers" size={16} class="text-brand" />
        <span id="ws-title" class="text-sm font-semibold">Workspaces</span>
        <button
          onclick={close}
          aria-label="Close"
          class="ml-auto grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p class="text-xs text-ink-faint">
          A workspace scopes its own collections and environments. Members are the Git contributors
          of its shared collections repo.
        </p>

        <div class="space-y-1.5">
          {#each wb.workspaces as ws (ws.id)}
            <div
              class="flex items-center gap-2 rounded-lg border px-2 py-1.5"
              class:border-brand={ws.id === wb.activeWorkspaceId}
              class:border-line={ws.id !== wb.activeWorkspaceId}
            >
              <button
                onclick={() => switchWorkspace(ws.id)}
                aria-label="Make active"
                title="Make active"
                class="grid size-6 shrink-0 place-items-center rounded"
              >
                <span
                  class="size-2.5 rounded-full"
                  class:bg-brand={ws.id === wb.activeWorkspaceId}
                  class:bg-line-strong={ws.id !== wb.activeWorkspaceId}
                ></span>
              </button>
              <input
                value={ws.name}
                onchange={(e) => renameWorkspace(ws.id, e.currentTarget.value)}
                aria-label="Workspace name"
                class="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none focus:text-ink"
              />
              <button
                onclick={() => deleteWorkspace(ws.id)}
                disabled={wb.workspaces.length <= 1}
                aria-label="Delete workspace"
                class="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          {/each}
        </div>

        <button
          onclick={() => createWorkspace()}
          class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
        >
          <Icon name="plus" size={14} />
          New workspace
        </button>

        <!-- Members of the active workspace -->
        <div class="border-t border-line pt-3">
          <h3 class="mb-2 flex items-center gap-1.5 text-11 font-semibold tracking-wide text-ink-muted uppercase">
            <Icon name="users" size={13} />
            Members
          </h3>
          {#if wb.members.length > 0}
            <ul class="space-y-1">
              {#each wb.members as m (m.email + m.name)}
                <li class="flex items-center gap-2 text-13">
                  <span
                    class="grid size-6 shrink-0 place-items-center rounded-full bg-panel-2 text-10 font-bold text-ink-muted"
                  >
                    {initials(m.name)}
                  </span>
                  <span class="min-w-0 flex-1 truncate text-ink">{m.name}</span>
                  <span class="shrink-0 text-11 tabular-nums text-ink-faint">
                    {m.commits} {m.commits === 1 ? "commit" : "commits"}
                  </span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-xs text-ink-faint">
              No members yet — publish this workspace's collections to a shared Git repo to gather
              contributors.
            </p>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
