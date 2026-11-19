<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { KeyValue } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import {
    wb,
    addRow,
    removeRow,
    ensureTrailingRow,
    createEnvironment,
    deleteEnvironment,
    saveEnvironmentVars,
  } from "./state.svelte";
  import PostmanEnvDialog from "./PostmanEnvDialog.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  // Postman import/export sub-dialog (rendered above this modal).
  let pmOpen = $state(false);
  let pmMode = $state<"import" | "export">("import");

  // Which environment is being edited in the right pane. Defaults to the active
  // one when the modal opens; falls back to the first if that one is deleted.
  let editingId = $state<string | null>(null);

  $effect(() => {
    if (open && !wb.environments.some((e) => e.id === editingId)) {
      editingId = wb.activeEnvId ?? wb.environments[0]?.id ?? null;
    }
  });

  const editing = $derived(wb.environments.find((e) => e.id === editingId) ?? null);

  function close() {
    open = false;
  }

  function addEnvironment() {
    editingId = createEnvironment();
  }

  function removeEnvironment(id: string) {
    deleteEnvironment(id);
    if (editingId === id) editingId = wb.activeEnvId ?? wb.environments[0]?.id ?? null;
  }

  function onKeydown(e: KeyboardEvent) {
    // The sub-dialog handles Escape itself (and stops propagation); don't let it
    // bubble up to close the whole editor.
    if (e.key === "Escape" && !pmOpen) close();
  }

  function openImport() {
    pmMode = "import";
    pmOpen = true;
  }

  function openExport() {
    pmMode = "export";
    pmOpen = true;
  }

  const definedCount = (list: KeyValue[]) => list.filter((v) => v.enabled && v.key).length;
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <!-- Backdrop -->
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
      aria-labelledby="env-editor-title"
      class="flex h-modal-sm max-h-modal w-full max-w-3xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <!-- Environment list -->
      <aside class="flex w-56 shrink-0 flex-col border-r border-line bg-canvas/40">
        <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          <Icon name="globe" size={15} class="text-ink-muted" />
          <span id="env-editor-title" class="text-sm font-semibold">Environments</span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          {#each wb.environments as env (env.id)}
            <button
              onclick={() => (editingId = env.id)}
              class="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors"
              class:bg-panel-2={editingId === env.id}
              class:text-ink={editingId === env.id}
              class:text-ink-muted={editingId !== env.id}
            >
              <span
                class="size-2 shrink-0 rounded-full"
                class:bg-brand={wb.activeEnvId === env.id}
                class:bg-line-strong={wb.activeEnvId !== env.id}
              ></span>
              <span class="min-w-0 flex-1 truncate">{env.name}</span>
              <span class="shrink-0 text-11 tabular-nums text-ink-faint">
                {definedCount(env.variables)}
              </span>
            </button>
          {/each}
        </div>
        <div class="flex h-11 shrink-0 items-stretch border-t border-line">
          <button
            onclick={addEnvironment}
            class="flex min-w-0 flex-1 items-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors hover:text-brand"
          >
            <Icon name="plus" size={15} class="shrink-0" />
            New environment
          </button>
          <button
            onclick={openImport}
            aria-label="Import Postman environment"
            title="Import Postman environment"
            class="grid w-11 shrink-0 place-items-center border-l border-line text-ink-muted transition-colors hover:text-brand"
          >
            <Icon name="download" size={15} />
          </button>
        </div>
      </aside>

      <!-- Editor pane -->
      <section class="flex min-w-0 flex-1 flex-col">
        <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
          {#if editing}
            <input
              bind:value={editing.name}
              onchange={saveEnvironmentVars}
              aria-label="Environment name"
              class="min-w-0 flex-1 bg-transparent text-sm font-semibold text-ink outline-none placeholder:text-ink-faint"
              placeholder="Environment name"
            />
            <button
              onclick={openExport}
              aria-label="Export environment as Postman"
              title="Export as Postman"
              class="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
            >
              <Icon name="upload" size={14} />
            </button>
            <button
              onclick={() => removeEnvironment(editing.id)}
              aria-label="Delete environment"
              class="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
            >
              <Icon name="trash" size={14} />
            </button>
          {:else}
            <span class="flex-1 text-sm text-ink-muted">No environment selected</span>
          {/if}
          <button
            onclick={close}
            aria-label="Close"
            class="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          {#if editing}
            <p class="mb-3 text-xs text-ink-faint">
              Reference these as
              <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-ink-muted">
                {"{{name}}"}
              </code>
              in a request's URL, headers, params, or body. Values stay on this device — they're
              never shared.
            </p>
            <div class="overflow-hidden rounded-lg border border-line">
              <div
                class="grid grid-kv items-stretch border-b border-line bg-panel-2/50 text-11 font-medium tracking-wide text-ink-faint uppercase"
              >
                <span></span>
                <span class="border-l border-line px-2.5 py-1.5">Variable</span>
                <span class="border-l border-line px-2.5 py-1.5">Value</span>
                <span class="border-l border-line"></span>
              </div>
              {#each editing.variables as row (row.id)}
                <div
                  class="grid grid-kv items-stretch border-b border-line/60 last:border-b-0 hover:bg-panel-2/30"
                >
                  <input
                    type="checkbox"
                    bind:checked={row.enabled}
                    onchange={saveEnvironmentVars}
                    aria-label="Enable variable"
                    class="size-3.5 place-self-center accent-brand"
                  />
                  <input
                    bind:value={row.key}
                    oninput={() => ensureTrailingRow(editing.variables)}
                    onchange={saveEnvironmentVars}
                    placeholder="base_url"
                    spellcheck="false"
                    class="grid-input w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
                  />
                  <input
                    bind:value={row.value}
                    oninput={() => ensureTrailingRow(editing.variables)}
                    onchange={saveEnvironmentVars}
                    placeholder="https://api.example.com"
                    spellcheck="false"
                    class="grid-input w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
                  />
                  <div class="flex items-center justify-center border-l border-line">
                    <button
                      onclick={() => {
                        removeRow(editing.variables, row.id);
                        saveEnvironmentVars();
                      }}
                      aria-label="Remove variable"
                      class="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              {/each}
            </div>
            <button
              onclick={() => addRow(editing.variables)}
              class="mt-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
            >
              <Icon name="plus" size={14} />
              Add variable
            </button>
          {:else}
            <div class="flex flex-col items-center gap-2 py-12 text-center">
              <Icon name="globe" size={22} class="text-ink-faint" />
              <p class="text-sm text-ink-muted">Create an environment to add variables.</p>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </div>

  <PostmanEnvDialog
    bind:open={pmOpen}
    mode={pmMode}
    env={editing}
    onImported={(id) => (editingId = id)}
  />
{/if}
