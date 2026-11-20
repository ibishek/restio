<script lang="ts">
  import { browser } from "$app/env";
  import Icon from "#lib/components/ui/Icon.svelte";
  import { toast } from "#lib/components/ui/toasts.svelte";
  import { openFile, pickSaveFile, saveResponseBody, saveResponseToFile } from "#lib/ipc";
  import type { HttpResponse, SavedResponse } from "#lib/types";
  import { extForContentType, humanBytes, saveFiltersForContentType } from "#lib/utils/format";
  import { highlightJson } from "#lib/utils/highlight";
  import ServerTimingViewer from "./ServerTimingViewer.svelte";
  import { summarizeServerTiming } from "#lib/utils/serverTiming";
  import {
    activeTab,
    deleteSavedResponse,
    renameSavedResponse,
    saveResponseAsExample,
    send,
    setActiveExample,
    statusTone,
    type ResTab,
  } from "./state.svelte";

  const isMac = browser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const sendMod = isMac ? "⌘" : "Ctrl";

  // The focused tab — its response (or saved example) is what this panel shows.
  const tab = $derived(activeTab()!);

  // Above this, rendering the body in the DOM (or even parsing/highlighting it)
  // can freeze the webview — so we don't render it, we offer a download instead.
  const MAX_RENDER_BYTES = 3 * 1024 * 1024; // 3 MB
  // Highlighting produces one span per token; cap it well below the render limit.
  const MAX_HIGHLIGHT_BYTES = 512 * 1024; // 512 KB

  let copied = $state(false);
  let htmlView = $state<"preview" | "raw">("preview");
  let downloading = $state(false);
  let savedPath = $state<string | null>(null);
  let downloadError = $state<string | null>(null);
  let headerFilter = $state("");
  let headersCopied = $state(false);
  let copiedHeader = $state<string | null>(null);

  let saveMenuOpen = $state(false);
  let examplesMenuOpen = $state(false);
  let editingExampleName = $state(false);
  let exampleNameInput = $state("");

  const activeExample = $derived.by((): SavedResponse | null => {
    if (!tab.activeExampleId || !tab.request.savedResponses) return null;
    return tab.request.savedResponses.find((e) => e.id === tab.activeExampleId) ?? null;
  });

  const isViewingExample = $derived(Boolean(activeExample));

  const currentResponse = $derived<HttpResponse | SavedResponse | null>(
    activeExample ?? tab.response,
  );

  const timingSummary = $derived.by(() =>
    summarizeServerTiming(currentResponse?.headers, currentResponse?.timeMs ?? 0),
  );

  const tabs = $derived<{ id: ResTab; label: string }[]>(
    isViewingExample
      ? [
          { id: "body", label: "Body" },
          { id: "headers", label: "Headers" },
          { id: "timing", label: "Timing" },
        ]
      : [
          { id: "body", label: "Body" },
          { id: "headers", label: "Headers" },
          { id: "timing", label: "Timing" },
          { id: "tests", label: "Test Results" },
        ],
  );

  const headerEntries = $derived.by(() => {
    const r = currentResponse;
    if (!r || !r.headers) return [];
    return Object.entries(r.headers);
  });

  const filteredHeaders = $derived.by(() => {
    const q = headerFilter.trim().toLowerCase();
    if (!q) return headerEntries;
    return headerEntries.filter(
      ([name, val]) => name.toLowerCase().includes(q) || val.toLowerCase().includes(q),
    );
  });

  const size = $derived(currentResponse?.sizeBytes ?? 0);
  const prettySize = $derived.by(() => humanBytes(size));

  const activeSavedPath = $derived(
    (currentResponse as HttpResponse | null)?.savedPath ?? savedPath,
  );
  const tooLarge = $derived(
    size > MAX_RENDER_BYTES || Boolean((currentResponse as HttpResponse | null)?.savedPath),
  );
  const contentType = $derived((currentResponse?.headers["content-type"] ?? "").toLowerCase());
  const isBase64 = $derived(currentResponse?.bodyEncoding === "base64");

  // How to render the body.
  const kind = $derived.by((): "image" | "html" | "json" | "text" => {
    const r = currentResponse;
    if (!r) return "text";
    if (contentType.startsWith("image/")) return "image";
    if (contentType.includes("html")) return "html";
    if (contentType.includes("json")) return "json";
    const t = r.body.trim();
    if (!contentType && (t.startsWith("{") || t.startsWith("["))) return "json";
    return "text";
  });

  // Pretty-print JSON; everything text stays as-is. Skipped entirely when the
  // body is too large (parsing it would block the main thread).
  const prettyBody = $derived.by(() => {
    const r = currentResponse;
    if (!r || tooLarge || isBase64) return "";
    if (kind === "json") {
      try {
        return JSON.stringify(JSON.parse(r.body), null, 2);
      } catch {
        // not valid JSON — show raw
      }
    }
    return r.body;
  });

  const highlighted = $derived(
    kind === "json" && !tooLarge && size < MAX_HIGHLIGHT_BYTES ? highlightJson(prettyBody) : "",
  );
  const dataUrl = $derived(
    isBase64 && !tooLarge && currentResponse
      ? `data:${contentType};base64,${currentResponse.body}`
      : "",
  );

  // Reset the download state whenever a new response arrives.
  $effect(() => {
    void tab.response;
    savedPath = null;
    downloadError = null;
    saveMenuOpen = false;
    examplesMenuOpen = false;
  });

  async function copyBody() {
    if (!currentResponse) return;
    await navigator.clipboard?.writeText(prettyBody);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }

  async function copyHeaders() {
    if (!currentResponse?.headers) return;
    const text = Object.entries(currentResponse.headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    await navigator.clipboard?.writeText(text);
    headersCopied = true;
    setTimeout(() => (headersCopied = false), 1400);
  }

  async function copyHeaderValue(val: string, name: string) {
    try {
      await navigator.clipboard?.writeText(val);
      copiedHeader = name;
      setTimeout(() => {
        if (copiedHeader === name) copiedHeader = null;
      }, 1400);
    } catch (err) {
      console.error("Failed to copy header value:", err);
    }
  }

  function defaultExportFilename(): string {
    const ext = extForContentType(contentType);
    const raw = (tab.request.name || "response")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    const base = raw || "response";
    return `${base}-${currentResponse?.status ?? 200}.${ext}`;
  }

  async function saveToFile() {
    const r = currentResponse;
    if (!r) return;
    saveMenuOpen = false;

    const filename = defaultExportFilename();

    try {
      const selectedPath = await pickSaveFile({
        title: "Save Response As",
        defaultPath: filename,
        filters: saveFiltersForContentType(contentType),
      });

      if (!selectedPath) return;

      const saved = await saveResponseToFile(
        selectedPath,
        r.body,
        r.bodyEncoding,
        (r as HttpResponse).savedPath ?? null,
      );
      savedPath = saved;
      toast.success("Response saved to file", saved.split("/").pop() || saved);
    } catch (err) {
      if (browser) {
        try {
          const mime = contentType || "text/plain";
          let blob: Blob;
          if (r.bodyEncoding === "base64") {
            const binaryStr = atob(r.body);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            blob = new Blob([bytes], { type: mime });
          } else {
            blob = new Blob([r.body], { type: mime });
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Response downloaded", filename);
          return;
        } catch (blobErr) {
          console.error("Download fallback failed:", blobErr);
        }
      }
      toast.error("Failed to save response", err instanceof Error ? err.message : String(err));
    }
  }

  async function quickDownload() {
    const r = currentResponse;
    if (!r || downloading) return;
    saveMenuOpen = false;
    downloading = true;
    downloadError = null;
    try {
      savedPath = await saveResponseBody(r.body, r.bodyEncoding, contentType);
      toast.success("Saved to Downloads", savedPath.split("/").pop() || savedPath);
    } catch (e) {
      downloadError = e instanceof Error ? e.message : String(e);
      toast.error("Download failed", downloadError);
    } finally {
      downloading = false;
    }
  }

  async function openSaved() {
    if (!activeSavedPath) return;
    try {
      await openFile(activeSavedPath);
    } catch (e) {
      downloadError = e instanceof Error ? e.message : String(e);
      toast.error("Could not open file", downloadError);
    }
  }

  function handleSaveExample() {
    saveMenuOpen = false;
    if (!tab.response) {
      toast.warn("No live response to save as example");
      return;
    }
    saveResponseAsExample(tab);
  }

  function startRenameExample() {
    if (!activeExample) return;
    exampleNameInput = activeExample.name;
    editingExampleName = true;
  }

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function commitRenameExample() {
    if (!activeExample) return;
    if (exampleNameInput.trim()) {
      renameSavedResponse(tab, activeExample.id, exampleNameInput.trim());
    }
    editingExampleName = false;
  }
</script>

<section class="flex min-h-0 w-full min-w-0 flex-1 flex-col bg-canvas/40">
  <header class="flex shrink-0 items-center gap-3 px-4 py-2.5">
    <div class="flex items-center gap-2">
      <h3 class="text-xs font-semibold tracking-wide text-ink-muted uppercase">Response</h3>

      {#if tab.request.savedResponses && tab.request.savedResponses.length > 0}
        <div class="relative">
          <button
            type="button"
            onclick={() => (examplesMenuOpen = !examplesMenuOpen)}
            class="flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2 py-0.5 text-11 font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-3"
            aria-haspopup="true"
            aria-expanded={examplesMenuOpen}
          >
            {#if isViewingExample}
              <span class="size-1.5 rounded-full bg-amber-400"></span>
              <span class="max-w-[120px] truncate">{activeExample?.name}</span>
            {:else}
              <span class="size-1.5 rounded-full bg-emerald-400"></span>
              <span>Live Response</span>
            {/if}
            <span class="rounded-full bg-panel px-1 text-10 text-ink-faint">
              {tab.request.savedResponses.length}
            </span>
            <Icon name="chevron-down" size={12} class="text-ink-faint" />
          </button>

          {#if examplesMenuOpen}
            <button
              type="button"
              class="fixed inset-0 z-30 cursor-default"
              onclick={() => (examplesMenuOpen = false)}
              aria-label="Close menu"
            ></button>

            <div
              class="absolute left-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-panel shadow-xl shadow-black/40 p-1 text-xs"
            >
              <div class="px-2 py-1 text-10 font-bold uppercase tracking-wider text-ink-faint">
                Response View
              </div>

              {#if tab.response}
                <button
                  type="button"
                  onclick={() => {
                    setActiveExample(tab, null);
                    examplesMenuOpen = false;
                  }}
                  class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-ink hover:bg-panel-2 transition-colors {!isViewingExample
                    ? 'font-semibold text-brand'
                    : ''}"
                >
                  <span class="flex items-center gap-1.5 truncate">
                    <span class="size-1.5 rounded-full bg-emerald-400"></span>
                    Live Response
                  </span>
                  {#if !isViewingExample}
                    <Icon name="check" size={13} class="text-brand shrink-0" />
                  {/if}
                </button>
              {/if}

              <div class="my-1 border-t border-line"></div>
              <div class="px-2 py-1 text-10 font-bold uppercase tracking-wider text-ink-faint">
                Saved Examples ({tab.request.savedResponses.length})
              </div>

              {#each tab.request.savedResponses as ex (ex.id)}
                <button
                  type="button"
                  onclick={() => {
                    setActiveExample(tab, ex.id);
                    examplesMenuOpen = false;
                  }}
                  class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-ink hover:bg-panel-2 transition-colors {activeExample?.id ===
                  ex.id
                    ? 'font-semibold text-brand'
                    : ''}"
                >
                  <span class="flex items-center gap-1.5 truncate">
                    <span class="size-1.5 rounded-full bg-amber-400"></span>
                    <span class="truncate">{ex.name}</span>
                  </span>
                  <span class="font-mono text-10 text-ink-faint shrink-0">
                    {ex.status}
                  </span>
                </button>
              {/each}

              {#if tab.response}
                <div class="my-1 border-t border-line"></div>
                <button
                  type="button"
                  onclick={() => {
                    handleSaveExample();
                    examplesMenuOpen = false;
                  }}
                  class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ink-muted hover:text-ink hover:bg-panel-2 transition-colors"
                >
                  <Icon name="plus" size={13} />
                  <span>Save current as example</span>
                </button>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>

    {#if currentResponse}
      <div class="flex items-center gap-3 text-13">
        <span class="flex items-center gap-1.5 font-semibold {statusTone(currentResponse.status)}">
          <span class="size-2 rounded-full bg-current"></span>
          {currentResponse.status}
          {currentResponse.statusText}
        </span>
        <span class="flex items-center gap-1 text-ink-muted">
          <Icon name="clock" size={13} />
          <span class="tabular-nums">{currentResponse.timeMs} ms</span>
        </span>
        <span class="tabular-nums text-ink-muted">{prettySize}</span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        {#if tab.resTab === "headers"}
          <button
            onclick={copyHeaders}
            class="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name={headersCopied ? "check" : "copy"} size={13} />
            {headersCopied ? "Copied" : "Copy headers"}
          </button>
        {:else if kind !== "image" && !tooLarge}
          <button
            onclick={copyBody}
            class="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <Icon name={copied ? "check" : "copy"} size={13} />
            {copied ? "Copied" : "Copy"}
          </button>
        {/if}

        <!-- Save Response Dropdown Button -->
        <div class="relative">
          <button
            type="button"
            onclick={() => (saveMenuOpen = !saveMenuOpen)}
            class="flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-3 active:scale-95"
            aria-haspopup="true"
            aria-expanded={saveMenuOpen}
          >
            <Icon name="save" size={13} />
            <span>Save Response</span>
            <Icon name="chevron-down" size={11} class="text-ink-muted" />
          </button>

          {#if saveMenuOpen}
            <button
              type="button"
              class="fixed inset-0 z-30 cursor-default"
              onclick={() => (saveMenuOpen = false)}
              aria-label="Close menu"
            ></button>

            <div
              class="absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-panel shadow-xl shadow-black/40 p-1 text-xs"
            >
              <button
                type="button"
                onclick={saveToFile}
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-panel-2 transition-colors"
              >
                <Icon name="file" size={14} class="text-ink-muted" />
                <span>Save to file…</span>
              </button>
              <button
                type="button"
                onclick={quickDownload}
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-panel-2 transition-colors"
              >
                <Icon name="download" size={14} class="text-ink-muted" />
                <span>Quick download</span>
              </button>
              <div class="my-1 border-t border-line"></div>
              <button
                type="button"
                onclick={handleSaveExample}
                disabled={!tab.response}
                title={tab.response ? "Save response as request example" : "No live response available"}
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-ink hover:bg-panel-2 transition-colors disabled:opacity-50"
              >
                <Icon name="bookmark" size={14} class="text-amber-400" />
                <span>Save as example</span>
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </header>

  {#if isViewingExample && activeExample}
    <!-- Saved example banner with rename and delete controls -->
    <div
      class="flex shrink-0 items-center justify-between border-y border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="rounded bg-amber-500/20 px-1.5 py-0.5 text-10 font-bold uppercase tracking-wider text-amber-300 shrink-0"
        >
          Saved Example
        </span>
        {#if editingExampleName}
          <input
            type="text"
            use:focusInput
            bind:value={exampleNameInput}
            onkeydown={(e) => {
              if (e.key === "Enter") commitRenameExample();
              if (e.key === "Escape") editingExampleName = false;
            }}
            onblur={commitRenameExample}
            class="h-6 rounded border border-amber-500/40 bg-panel px-1.5 text-xs text-ink focus:outline-none"
          />
        {:else}
          <span class="font-medium truncate">{activeExample.name}</span>
          <button
            type="button"
            onclick={startRenameExample}
            title="Rename example"
            class="text-amber-300/80 hover:text-amber-200 underline text-11"
          >
            rename
          </button>
        {/if}
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onclick={() => deleteSavedResponse(tab, activeExample.id)}
          class="flex items-center gap-1 text-rose-300 hover:text-rose-200 transition-colors"
        >
          <Icon name="trash" size={12} />
          Delete
        </button>
        <span class="text-amber-500/40">|</span>
        <button
          type="button"
          onclick={() => setActiveExample(tab, null)}
          class="font-medium text-amber-300 hover:text-amber-100 hover:underline transition-colors"
        >
          View Live Response
        </button>
      </div>
    </div>
  {/if}

  {#if currentResponse}
    <div class="flex shrink-0 items-center gap-1 border-y border-line px-4">
      {#each tabs as rt (rt.id)}
        <button
          onclick={() => (tab.resTab = rt.id)}
          class="relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors"
          class:text-ink={tab.resTab === rt.id}
          class:text-ink-muted={tab.resTab !== rt.id}
        >
          {rt.label}
          {#if rt.id === "headers" && headerEntries.length > 0}
            <span class="rounded-full bg-panel-2 px-1.5 text-10 font-medium tabular-nums text-ink-muted">
              {headerEntries.length}
            </span>
          {:else if rt.id === "timing" && timingSummary.hasTimings}
            <span class="rounded-full bg-sky-500/15 px-1.5 text-10 font-medium tabular-nums text-sky-400">
              {timingSummary.metrics.length}
            </span>
          {:else if rt.id === "tests" && !isViewingExample && tab.testResults.length > 0}
            {@const passed = tab.testResults.filter((t) => t.passed).length}
            {@const total = tab.testResults.length}
            <span
              class="rounded-full px-1.5 py-0.2 text-10 font-medium tabular-nums {passed === total
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-rose-500/15 text-rose-400'}"
            >
              {passed}/{total}
            </span>
          {/if}
          {#if tab.resTab === rt.id}
            <span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"></span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="min-h-0 w-full min-w-0 flex-1 overflow-y-auto p-4 overscroll-contain">
      {#if tab.resTab === "body"}
        {#if tooLarge}
          <!-- Too large to render safely — offer download / save to file or open saved file -->
          <div class="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <span
              class="grid size-12 place-items-center rounded-xl border border-line bg-panel-2/50 text-ink-faint"
            >
              <Icon name="layers" size={20} />
            </span>
            <p class="text-sm font-medium text-ink">Response is {prettySize}</p>
            <p class="max-w-xs text-xs text-ink-faint">
              {#if (currentResponse as HttpResponse | null)?.savedPath}
                Streamed directly to disk to protect memory.
              {:else}
                Too large to display without freezing the app. Save it to disk to view in another tool.
              {/if}
            </p>

            {#if activeSavedPath}
              <p class="flex items-center gap-1.5 text-xs font-medium text-brand">
                <Icon name="check" size={13} />
                {(currentResponse as HttpResponse | null)?.savedPath ? "Saved to disk" : "Saved"}
              </p>
              <p class="max-w-md font-mono text-11 break-all text-ink-muted">{activeSavedPath}</p>
              <div class="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onclick={openSaved}
                  class="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-panel-3 active:scale-95"
                >
                  <Icon name="file" size={14} />
                  Open File
                </button>
                <button
                  type="button"
                  onclick={saveToFile}
                  class="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-line-strong hover:bg-panel-3 active:scale-95"
                >
                  <Icon name="save" size={14} />
                  Save Copy As…
                </button>
              </div>
            {:else}
              <div class="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onclick={saveToFile}
                  class="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-brand-strong active:scale-95"
                >
                  <Icon name="save" size={15} />
                  Save to file…
                </button>
                <button
                  type="button"
                  onclick={quickDownload}
                  disabled={downloading}
                  class="flex items-center gap-1.5 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm font-semibold text-ink transition-all hover:border-line-strong hover:bg-panel-3 active:scale-95 disabled:opacity-50"
                >
                  {#if downloading}
                    <span
                      class="size-4 animate-spin rounded-full border-2 border-ink/40 border-t-ink"
                    ></span>
                    Saving
                  {:else}
                    <Icon name="download" size={15} />
                    Download
                  {/if}
                </button>
              </div>
            {/if}
            {#if downloadError}
              <p class="max-w-md text-xs break-words text-danger">{downloadError}</p>
            {/if}
          </div>
        {:else if kind === "image"}
          <div class="flex min-h-full items-center justify-center">
            <img
              src={dataUrl}
              alt="Response body"
              class="max-h-full max-w-full rounded-lg border border-line bg-panel-2/40 object-contain"
            />
          </div>
        {:else if kind === "html"}
          <div class="flex min-h-full flex-col gap-2">
            <div class="flex shrink-0 gap-1 rounded-md bg-panel-2/60 p-0.5 text-xs font-medium">
              {#each ["preview", "raw"] as const as v (v)}
                <button
                  type="button"
                  onclick={() => (htmlView = v)}
                  class="rounded px-2.5 py-1 capitalize transition-colors"
                  class:bg-panel={htmlView === v}
                  class:text-ink={htmlView === v}
                  class:text-ink-muted={htmlView !== v}
                >
                  {v}
                </button>
              {/each}
            </div>
            {#if htmlView === "preview"}
              <!-- sandbox="" blocks scripts/forms — safe preview of untrusted HTML -->
              <iframe
                title="Response preview"
                sandbox=""
                srcdoc={prettyBody}
                class="min-h-editor w-full flex-1 rounded-lg border border-line bg-white"
              ></iframe>
            {:else}
              <pre
                class="min-w-0 font-mono text-13 leading-relaxed break-words whitespace-pre-wrap text-ink">{prettyBody}</pre>
            {/if}
          </div>
        {:else if kind === "json" && highlighted}
          <pre
            class="min-w-0 font-mono text-13 leading-relaxed break-words whitespace-pre-wrap"><code
            >{@html highlighted}</code></pre>
        {:else}
          <pre
            class="min-w-0 font-mono text-13 leading-relaxed break-words whitespace-pre-wrap text-ink">{prettyBody}</pre>
        {/if}
      {:else if tab.resTab === "headers"}
        <div class="space-y-3">
          {#if headerEntries.length > 3}
            <div class="flex items-center justify-between gap-3">
              <div class="relative w-64 max-w-full">
                <input
                  type="text"
                  bind:value={headerFilter}
                  placeholder="Filter response headers…"
                  class="h-7 w-full rounded-md border border-line bg-panel-2 px-2.5 pl-7 text-xs text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
                />
                <span class="pointer-events-none absolute left-2 top-2 text-ink-faint">
                  <Icon name="search" size={11} />
                </span>
                {#if headerFilter}
                  <button
                    type="button"
                    onclick={() => (headerFilter = "")}
                    class="absolute right-1.5 top-1.5 text-ink-faint hover:text-ink"
                    aria-label="Clear filter"
                  >
                    <Icon name="x" size={12} />
                  </button>
                {/if}
              </div>

              {#if headerFilter}
                <span class="text-xs text-ink-faint">
                  {filteredHeaders.length} of {headerEntries.length}
                </span>
              {/if}
            </div>
          {/if}

          <div class="w-full overflow-x-auto rounded-lg border border-line bg-panel/30">
            <div class="min-w-[480px]">
              {#each filteredHeaders as [name, value] (name)}
                <div
                  class="group flex items-start gap-3 border-b border-line/60 px-3 py-2 last:border-b-0 hover:bg-panel-2/30 transition-colors"
                >
                  <span
                    class="w-48 shrink-0 font-mono text-13 font-medium break-words text-sky-300 select-text"
                    >{name}</span
                  >
                  <span
                    class="min-w-0 flex-1 font-mono text-13 break-all text-ink-muted select-text"
                    >{value}</span
                  >
                  <button
                    type="button"
                    onclick={() => copyHeaderValue(value, name)}
                    title="Copy header value"
                    class="shrink-0 p-1 text-ink-faint transition-opacity group-hover:opacity-100 opacity-0 hover:text-ink"
                    aria-label="Copy {name} value"
                  >
                    <Icon
                      name={copiedHeader === name ? "check" : "copy"}
                      size={13}
                      class={copiedHeader === name ? "text-brand" : ""}
                    />
                  </button>
                </div>
              {:else}
                <div class="p-6 text-center text-xs text-ink-faint">
                  No headers match “{headerFilter}”
                </div>
              {/each}
            </div>
          </div>
        </div>
      {:else if tab.resTab === "timing"}
        <ServerTimingViewer
          headers={currentResponse.headers}
          clientRoundTripMs={currentResponse.timeMs}
        />
      {:else if tab.resTab === "tests"}
        {#if isViewingExample}
          <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span
              class="grid size-12 place-items-center rounded-xl border border-line bg-panel-2/50 text-ink-faint"
            >
              <Icon name="bookmark" size={20} class="text-amber-400" />
            </span>
            <p class="text-sm font-medium text-ink">Saved Example Response</p>
            <p class="max-w-xs text-xs text-ink-faint">
              Viewing a static saved example. Test assertions run against real responses when a request is sent.
            </p>
          </div>
        {:else if tab.testResults.length === 0 && tab.scriptLogs.length === 0}
          <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span
              class="grid size-12 place-items-center rounded-xl border border-line bg-panel-2/50 text-ink-faint"
            >
              <Icon name="code" size={20} />
            </span>
            <p class="text-sm font-medium text-ink">No test results</p>
            <p class="max-w-xs text-xs text-ink-faint">
              Add test assertions under Request &gt; Scripts &gt; Post-response / Tests to validate responses automatically.
            </p>
          </div>
        {:else}
          <div class="space-y-4">
            {#if tab.testResults.length > 0}
              {@const passed = tab.testResults.filter((t) => t.passed).length}
              {@const total = tab.testResults.length}
              {@const failed = total - passed}

              <!-- Summary banner -->
              <div class="flex items-center gap-4 rounded-lg border border-line bg-panel-2/40 px-4 py-2.5">
                <span class="text-xs font-semibold uppercase tracking-wide text-ink-muted">Summary:</span>
                <span class="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Icon name="check" size={13} />
                  {passed} Passed
                </span>
                {#if failed > 0}
                  <span class="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                    <Icon name="x" size={13} />
                    {failed} Failed
                  </span>
                {/if}
                <span class="text-xs text-ink-faint">
                  ({total} total {total === 1 ? "test" : "tests"})
                </span>
              </div>

              <!-- List of test cards -->
              <div class="space-y-2">
                {#each tab.testResults as test, i (i)}
                  <div
                    class="rounded-lg border p-3 transition-colors {test.passed
                      ? 'border-emerald-500/20 bg-emerald-500/5'
                      : 'border-rose-500/30 bg-rose-500/5'}"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-2">
                        <span
                          class="grid size-5 place-items-center rounded-full text-xs font-bold {test.passed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'}"
                        >
                          <Icon name={test.passed ? "check" : "x"} size={12} />
                        </span>
                        <span class="text-13 font-medium {test.passed ? 'text-ink' : 'text-rose-200'}">
                          {test.name}
                        </span>
                      </div>
                      {#if test.durationMs != null}
                        <span class="font-mono text-11 tabular-nums text-ink-muted">
                          {test.durationMs.toFixed(1)} ms
                        </span>
                      {/if}
                    </div>

                    {#if !test.passed && test.error}
                      <div class="mt-2.5 rounded border border-rose-500/25 bg-black/40 p-2.5 font-mono text-xs text-rose-300">
                        {test.error}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            {#if tab.scriptLogs.length > 0}
              <div class="space-y-2 pt-2">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Console Output ({tab.scriptLogs.length})
                </h4>
                <div class="overflow-x-auto rounded-lg border border-line bg-black/50 p-3 font-mono text-xs leading-relaxed text-ink-muted">
                  {#each tab.scriptLogs as log, i (i)}
                    <div class="flex items-start gap-2">
                      <span class="select-none text-ink-faint">&gt;</span>
                      <span class="break-all whitespace-pre-wrap text-ink">{log}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {:else if tab.error && !tab.sending}
    <!-- Error state -->
    <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span
        class="grid size-12 place-items-center rounded-xl border border-danger/40 bg-danger/10 text-danger"
      >
        <Icon name="globe" size={20} />
      </span>
      <p class="text-sm font-medium text-ink">Request failed</p>
      <p class="max-w-md font-mono text-xs break-words text-danger/90">{tab.error}</p>
      {#if tab.scriptLogs.length > 0}
        <div class="w-full max-w-lg mt-2 text-left">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1">Pre-request Console Output:</h4>
          <div class="overflow-x-auto rounded border border-line bg-black/50 p-2 font-mono text-xs text-ink-muted">
            {#each tab.scriptLogs as log, i (i)}
              <div>&gt; {log}</div>
            {/each}
          </div>
        </div>
      {/if}
      <button
        onclick={() => tab.request.url && send()}
        class="mt-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        Retry
      </button>
    </div>
  {:else}
    <!-- Empty / loading state -->
    <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      {#if tab.sending}
        <span class="size-6 animate-spin rounded-full border-2 border-line-strong border-t-brand"></span>
        <p class="text-sm text-ink-muted">Sending request…</p>
      {:else}
        <span class="grid size-12 place-items-center rounded-xl border border-line bg-panel-2/50 text-ink-faint">
          <Icon name="send" size={20} />
        </span>
        <p class="text-sm text-ink-muted">Send a request to see the response</p>
        <p class="text-xs text-ink-faint">
          Press <kbd class="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-11">{sendMod}</kbd>
          <kbd class="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-11">Enter</kbd>
          to send
        </p>

        {#if tab.request.savedResponses && tab.request.savedResponses.length > 0}
          <div class="mt-4 flex flex-col items-center gap-2 rounded-xl border border-line bg-panel-2/30 p-3 max-w-sm w-full">
            <p class="text-xs font-medium text-ink-muted">
              Saved Example Responses ({tab.request.savedResponses.length})
            </p>
            <div class="flex flex-wrap justify-center gap-1.5 w-full">
              {#each tab.request.savedResponses as ex (ex.id)}
                <button
                  type="button"
                  onclick={() => setActiveExample(tab, ex.id)}
                  class="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-xs text-ink transition-colors hover:border-line-strong hover:bg-panel-2"
                >
                  <span class="size-1.5 rounded-full bg-amber-400"></span>
                  <span class="font-medium truncate max-w-[140px]">{ex.name}</span>
                  <span class="font-mono text-10 text-ink-faint">({ex.status})</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
