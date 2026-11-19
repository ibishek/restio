<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { Collection } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { fromPostman, toPostman } from "#lib/utils/postman";
  import { addImportedCollection } from "./state.svelte";

  let {
    open = $bindable(false),
    mode = "import",
    collection = null,
  }: { open?: boolean; mode?: "import" | "export"; collection?: Collection | null } = $props();

  let copied = $state(false);
  let importText = $state("");
  let error = $state("");
  let fileInput: HTMLInputElement | undefined = $state();

  const exportJson = $derived(collection ? JSON.stringify(toPostman(collection), null, 2) : "");

  function close() {
    open = false;
    importText = "";
    error = "";
    copied = false;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(exportJson);
      copied = true;
      setTimeout(() => (copied = false), 1400);
    } catch {
      // Clipboard unavailable — the user can select the text manually.
    }
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importText = await file.text();
    error = "";
  }

  function doImport() {
    const col = fromPostman(importText.trim());
    if (!col) {
      error = "That doesn’t look like a Postman v2.1 collection.";
      return;
    }
    addImportedCollection(col);
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
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
      aria-labelledby="postman-dialog-title"
      class="flex h-modal max-h-modal w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <!-- Header -->
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="layers" size={15} class="text-ink-muted" />
        <span id="postman-dialog-title" class="text-sm font-semibold">
          {mode === "export" ? "Export as Postman" : "Import Postman collection"}
        </span>
        {#if mode === "export"}
          <button
            onclick={copy}
            class="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            class:border-brand={copied}
            class:text-brand={copied}
            class:border-line={!copied}
            class:text-ink-muted={!copied}
            class:hover:border-line-strong={!copied}
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
            {copied ? "Copied" : "Copy"}
          </button>
        {/if}
        <button
          onclick={close}
          aria-label="Close"
          class="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
          class:ml-auto={mode === "import"}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {#if mode === "export"}
        <div class="min-h-0 flex-1 overflow-auto bg-canvas/40">
          <pre class="p-4 font-mono text-13 leading-relaxed whitespace-pre text-ink"><code>{exportJson}</code></pre>
        </div>
        <div class="flex h-11 shrink-0 items-center gap-1.5 border-t border-line px-3 text-11 text-ink-faint">
          <Icon name="git-branch" size={12} />
          Postman Collection v2.1. Base URL &amp; folder prefixes are composed into each request URL.
        </div>
      {:else}
        <div class="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div class="flex items-center gap-2">
            <button
              onclick={() => fileInput?.click()}
              class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Icon name="upload" size={13} />
              Choose .json file…
            </button>
            <span class="text-11 text-ink-faint">or paste the collection JSON below</span>
            <input bind:this={fileInput} onchange={onFile} type="file" accept=".json,application/json" class="hidden" />
          </div>
          <textarea
            bind:value={importText}
            oninput={() => (error = "")}
            spellcheck="false"
            placeholder={'{\n  "info": { "name": "…", "schema": "…/v2.1.0/collection.json" },\n  "item": [ … ]\n}'}
            class="min-h-0 flex-1 resize-none rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          ></textarea>
          {#if error}
            <p class="flex items-center gap-1.5 text-11 text-danger">
              <Icon name="alert-triangle" size={12} />
              {error}
            </p>
          {/if}
        </div>
        <div class="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-line px-3">
          <button
            onclick={close}
            class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Cancel
          </button>
          <button
            onclick={doImport}
            disabled={!importText.trim()}
            class="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" size={13} />
            Import
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
