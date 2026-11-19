<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { toast } from "#lib/components/ui/toasts.svelte";
  import type { Collection } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { fromOpenApi, inspectSpec, toOpenApi } from "#lib/utils/openapi";
  import { addImportedCollection } from "./state.svelte";

  let {
    open = $bindable(false),
    mode = "import",
    collection = null,
  }: { open?: boolean; mode?: "import" | "export"; collection?: Collection | null } = $props();

  let exportFormat = $state<"yaml" | "json">("yaml");
  let copied = $state(false);
  let importText = $state("");
  let error = $state("");
  let isDraggingOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  const exportText = $derived(
    collection ? toOpenApi(collection, exportFormat) : "",
  );

  const specInfo = $derived(
    mode === "import" && importText.trim() ? inspectSpec(importText) : null,
  );

  function close() {
    open = false;
    importText = "";
    error = "";
    copied = false;
    isDraggingOver = false;
  }

  async function copy() {
    if (!exportText) return;
    try {
      await navigator.clipboard.writeText(exportText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
      toast.info("Copied specification to clipboard");
    } catch {
      // Clipboard unavailable
    }
  }

  function downloadFile() {
    if (!exportText) return;
    const baseName = (collection?.name || "collection")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const ext = exportFormat === "yaml" ? "yaml" : "json";
    const filename = `${baseName || "api"}-openapi.${ext}`;
    const mime =
      exportFormat === "yaml" ? "text/yaml;charset=utf-8" : "application/json;charset=utf-8";

    const blob = new Blob([exportText], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      importText = await file.text();
      error = "";
    } catch (err) {
      error = "Failed to read file: " + (err as Error).message;
    }
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = true;
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      try {
        importText = await file.text();
        error = "";
      } catch (err) {
        error = "Failed to read dropped file: " + (err as Error).message;
      }
    }
  }

  function doImport() {
    const trimmed = importText.trim();
    if (!trimmed) return;

    const col = fromOpenApi(trimmed);
    if (!col) {
      error = "Unable to parse OpenAPI or Swagger document. Ensure valid YAML or JSON syntax.";
      return;
    }

    addImportedCollection(col);
    const count =
      col.requests.length +
      col.folders.reduce(
        (acc, f) =>
          acc + f.requests.length + f.folders.reduce((a2, f2) => a2 + f2.requests.length, 0),
        0,
      );
    toast.success(`Imported collection "${col.name}"`, `${count} requests configured`);
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
      aria-labelledby="openapi-dialog-title"
      class="flex h-modal max-h-modal w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <!-- Header -->
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="file" size={15} class="text-ink-muted" />
        <span id="openapi-dialog-title" class="text-sm font-semibold text-ink">
          {mode === "export" ? "Export OpenAPI Specification" : "Import OpenAPI / Swagger"}
        </span>

        {#if mode === "export"}
          <!-- Format Switcher -->
          <div class="ml-auto flex items-center gap-1 rounded-md bg-panel-2/60 p-0.5 text-xs">
            <button
              onclick={() => (exportFormat = "yaml")}
              class="rounded px-2 py-0.5 font-medium transition-colors"
              class:bg-panel={exportFormat === "yaml"}
              class:text-ink={exportFormat === "yaml"}
              class:text-ink-muted={exportFormat !== "yaml"}
            >
              YAML
            </button>
            <button
              onclick={() => (exportFormat = "json")}
              class="rounded px-2 py-0.5 font-medium transition-colors"
              class:bg-panel={exportFormat === "json"}
              class:text-ink={exportFormat === "json"}
              class:text-ink-muted={exportFormat !== "json"}
            >
              JSON
            </button>
          </div>

          <button
            onclick={copy}
            class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            class:border-brand={copied}
            class:text-brand={copied}
            class:border-line={!copied}
            class:text-ink-muted={!copied}
            class:hover:border-line-strong={!copied}
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
            {copied ? "Copied" : "Copy"}
          </button>

          <button
            onclick={downloadFile}
            class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            title="Download file"
          >
            <Icon name="download" size={13} />
            Download
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
          <pre class="p-4 font-mono text-13 leading-relaxed whitespace-pre text-ink"><code>{exportText}</code></pre>
        </div>
        <div class="flex h-11 shrink-0 items-center justify-between border-t border-line px-3 text-11 text-ink-faint">
          <div class="flex items-center gap-1.5">
            <Icon name="code" size={12} />
            <span>OpenAPI 3.1.0 · Tags, schemas, query parameters &amp; auth preserved</span>
          </div>
          <span class="font-mono text-10">{exportFormat.toUpperCase()}</span>
        </div>
      {:else}
        <!-- Import Mode -->
        <div class="flex min-h-0 flex-1 flex-col gap-2 p-3">
          <!-- Drop zone / Upload trigger -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            ondragover={onDragOver}
            ondragleave={onDragLeave}
            ondrop={onDrop}
            class="flex items-center justify-between rounded-lg border border-dashed px-3 py-2 transition-colors {isDraggingOver
              ? 'border-brand bg-brand/10'
              : 'border-line hover:border-line-strong'}"
          >
            <div class="flex items-center gap-2">
              <button
                onclick={() => fileInput?.click()}
                class="flex items-center gap-1.5 rounded-md border border-line bg-panel-2/60 px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <Icon name="upload" size={13} />
                Choose OpenAPI file…
              </button>
              <span class="text-11 text-ink-faint">or drop YAML / JSON file here</span>
              <input
                bind:this={fileInput}
                onchange={onFile}
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml,text/x-yaml"
                class="hidden"
              />
            </div>
            <span class="text-10 text-ink-faint">Swagger 2.0, OpenAPI 3.0, 3.1</span>
          </div>

          <!-- Spec text area -->
          <textarea
            bind:value={importText}
            oninput={() => (error = "")}
            spellcheck="false"
            placeholder={'openapi: 3.1.0\ninfo:\n  title: My Service API\n  version: 1.0.0\npaths:\n  /users:\n    get:\n      summary: List all users'}
            class="min-h-0 flex-1 resize-none rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          ></textarea>

          <!-- Spec status badge & inspection info -->
          {#if specInfo?.valid}
            <div class="flex items-center justify-between rounded-md border border-brand/30 bg-brand/5 px-2.5 py-1.5 text-11">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1 font-semibold text-brand">
                  <span class="size-1.5 rounded-full bg-brand"></span>
                  {specInfo.type === "swagger" ? "Swagger" : "OpenAPI"} {specInfo.version}
                </span>
                <span class="text-ink-faint">·</span>
                <span class="font-medium text-ink truncate max-w-xs">{specInfo.title}</span>
              </div>
              <span class="rounded bg-panel-2 px-1.5 py-0.5 text-10 font-medium text-ink-muted">
                {specInfo.endpointCount} {specInfo.endpointCount === 1 ? "endpoint" : "endpoints"}
              </span>
            </div>
          {:else if specInfo?.error && importText.trim()}
            <p class="flex items-center gap-1.5 text-11 text-warn">
              <Icon name="alert-triangle" size={12} />
              {specInfo.error}
            </p>
          {/if}

          {#if error}
            <p class="flex items-center gap-1.5 text-11 text-danger">
              <Icon name="alert-triangle" size={12} />
              {error}
            </p>
          {/if}
        </div>

        <!-- Footer -->
        <div class="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-line px-3">
          <button
            onclick={close}
            class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            Cancel
          </button>
          <button
            onclick={doImport}
            disabled={!specInfo?.valid}
            class="flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-slate-950 transition-all hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" size={13} />
            Import Collection
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
