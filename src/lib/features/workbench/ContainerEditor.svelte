<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import AuthEditor from "./AuthEditor.svelte";
  import VarInput from "./VarInput.svelte";
  import type { Collection, Folder } from "#lib/types";
  import { activeTab, containerNode, commitCollections, openRunner } from "./state.svelte";

  const tab = $derived(activeTab()!); // only rendered for a container tab
  const isCollection = $derived((tab.containerLoc?.folderIds.length ?? 0) === 0);
  // Live reference into wb.collections — bindings mutate the store directly, so
  // edits persist via commitCollections just like the old inline panel did.
  const node = $derived(containerNode(tab.containerLoc));

  const countRequests = (n: Collection | Folder): number =>
    n.requests.length + n.folders.reduce((sum, f) => sum + countRequests(f), 0);
</script>

<section class="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {#if !node}
    <div class="grid flex-1 place-items-center p-6 text-center">
      <div class="flex flex-col items-center gap-3">
        <span class="grid size-12 place-items-center rounded-xl border border-line bg-panel-2/50 text-ink-faint">
          <Icon name="alert-triangle" size={20} />
        </span>
        <p class="text-sm text-ink-muted">This item no longer exists.</p>
      </div>
    </div>
  {:else}
    {@const asCol = node as Collection}
    {@const asFolder = node as Folder}
    <div class="w-full space-y-6 p-6">
      <!-- Header -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-panel-2/60 text-ink-muted">
            <Icon name={isCollection ? "layers" : "folder"} size={18} />
          </span>
          <div class="min-w-0">
            <h1 class="truncate text-base font-semibold text-ink">{node.name || "Untitled"}</h1>
            <p class="text-11 text-ink-faint">
              {isCollection ? "Collection" : "Folder"} · {countRequests(node)} request{countRequests(node) === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {#if tab.containerLoc && countRequests(node) > 0}
          <button
            type="button"
            onclick={() => openRunner(tab.containerLoc!)}
            class="flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-brand/20 transition-all hover:bg-brand-strong active:scale-95"
          >
            <Icon name="send" size={14} />
            Run {isCollection ? "Collection" : "Folder"}
          </button>
        {/if}
      </div>

      <label class="block">
        <span class="mb-1.5 block text-11 font-medium tracking-wide text-ink-muted uppercase">Name</span>
        <input
          bind:value={node.name}
          onchange={commitCollections}
          class="h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink focus:border-brand/60 focus:outline-none"
        />
      </label>

      {#if isCollection}
        <label class="block">
          <span class="mb-1.5 block text-11 font-medium tracking-wide text-ink-muted uppercase">Base URL</span>
          <VarInput
            bind:value={asCol.baseUrl}
            onchange={commitCollections}
            placeholder="https://api.example.com"
            class="h-9 w-full rounded-md border border-line bg-panel px-3 font-mono text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          />
          <span class="mt-1.5 block text-11 text-ink-faint">Prepended to every request URL in this collection.</span>
        </label>
      {:else}
        <label class="block">
          <span class="mb-1.5 block text-11 font-medium tracking-wide text-ink-muted uppercase">URL prefix</span>
          <VarInput
            bind:value={asFolder.urlPrefix}
            onchange={commitCollections}
            placeholder="/v1"
            class="h-9 w-full rounded-md border border-line bg-panel px-3 font-mono text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          />
          <span class="mt-1.5 block text-11 text-ink-faint">Prepended to request URLs inside this folder.</span>
        </label>
      {/if}

      <div>
        <span class="mb-1.5 block text-11 font-medium tracking-wide text-ink-muted uppercase">
          Auth {isCollection ? "" : "· inherited by requests inside"}
        </span>
        {#if node.auth}
          <AuthEditor bind:auth={node.auth} allowInherit onchange={commitCollections} />
        {/if}
      </div>
    </div>
  {/if}
</section>
