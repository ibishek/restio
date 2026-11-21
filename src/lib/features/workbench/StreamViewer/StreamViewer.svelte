<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { toast } from "#lib/components/ui/toasts.svelte";
  import { humanBytes, humanMs } from "#lib/utils/format";
  import { cancel } from "../state.svelte";
  import type { Tab } from "../stores/types";
  import LlmStreamView from "./LlmStreamView.svelte";
  import RawEventList from "./RawEventList.svelte";

  let { tab }: { tab: Tab } = $props();

  let viewMode = $state<"llm" | "events">("llm");
  let copiedAll = $state(false);

  const isStreaming = $derived(tab.isStreaming);
  const wasCancelled = $derived(tab.cancelled);
  const events = $derived(tab.streamEvents);
  const metrics = $derived(tab.streamMetrics);

  async function copyAllStream() {
    const content =
      viewMode === "llm"
        ? tab.streamText
        : events.map((e) => `event: ${e.eventType}\ndata: ${e.data}\n`).join("\n");
    if (!content) return;
    await navigator.clipboard?.writeText(content);
    copiedAll = true;
    setTimeout(() => (copiedAll = false), 1400);
  }

  function exportStream() {
    const filename = `${tab.request.name || "stream"}-${Date.now()}.${viewMode === "llm" ? "txt" : "jsonl"}`;
    const content =
      viewMode === "llm"
        ? tab.streamText
        : events.map((e) => JSON.stringify({ id: e.id, event: e.eventType, data: e.data, deltaMs: e.deltaMs })).join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Stream exported", filename);
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-surface-base font-sans">
  <!-- Top Stream Status & Metrics Toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-2 text-xs">
    <!-- Status & Live Metrics -->
    <div class="flex items-center gap-3">
      {#if isStreaming}
        <div class="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400 border border-emerald-500/20">
          <span class="inline-block h-2 w-2 animate-ping rounded-full bg-emerald-400"></span>
          <span class="font-medium">Streaming</span>
        </div>
      {:else if wasCancelled}
        <div class="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-400 border border-rose-500/20">
          <span class="font-medium">Aborted</span>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 rounded-full bg-surface-elevated px-2.5 py-1 text-ink-muted border border-border-subtle">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
          <span class="font-medium">Completed</span>
        </div>
      {/if}

      <!-- Detailed Real-time Metrics -->
      <div class="hidden sm:flex items-center gap-2.5 font-mono text-[11px] text-ink-muted">
        <span>{events.length} events</span>
        <span>·</span>
        {#if metrics.ttftMs !== null}
          <span title="Time to First Token">TTFT: {metrics.ttftMs}ms</span>
          <span>·</span>
        {/if}
        {#if metrics.tokenCount > 0}
          <span>~{metrics.tokenCount} tok</span>
          <span>·</span>
          <span>{metrics.tokensPerSec} tok/s</span>
          <span>·</span>
        {/if}
        <span>{humanMs(metrics.durationMs)}</span>
        <span>·</span>
        <span>{humanBytes(metrics.totalBytes)}</span>
      </div>
    </div>

    <!-- Mode Selector & Controls -->
    <div class="flex items-center gap-2">
      <!-- Mode Toggle Buttons -->
      <div class="flex rounded border border-border-subtle bg-surface-base p-0.5 text-xs">
        <button
          type="button"
          onclick={() => (viewMode = "llm")}
          class="flex items-center gap-1 rounded px-2.5 py-0.5 transition-colors {viewMode === 'llm'
            ? 'bg-accent/15 text-accent font-medium'
            : 'text-ink-muted hover:text-ink'}"
        >
          <span>✦ LLM View</span>
        </button>
        <button
          type="button"
          onclick={() => (viewMode = "events")}
          class="flex items-center gap-1 rounded px-2.5 py-0.5 transition-colors {viewMode === 'events'
            ? 'bg-accent/15 text-accent font-medium'
            : 'text-ink-muted hover:text-ink'}"
        >
          <span>≡ Events ({events.length})</span>
        </button>
      </div>

      <!-- Quick Actions -->
      <button
        type="button"
        onclick={copyAllStream}
        title="Copy stream content"
        class="flex items-center gap-1 rounded border border-border-subtle bg-surface-base px-2.5 py-1 text-ink-muted hover:border-accent hover:text-ink transition-colors"
      >
        <Icon name={copiedAll ? "check" : "copy"} size={13} class={copiedAll ? "text-emerald-400" : ""} />
        <span>{copiedAll ? "Copied" : "Copy"}</span>
      </button>

      <button
        type="button"
        onclick={exportStream}
        title="Export stream as file"
        class="flex items-center gap-1 rounded border border-border-subtle bg-surface-base px-2.5 py-1 text-ink-muted hover:border-accent hover:text-ink transition-colors"
      >
        <Icon name="download" size={13} />
        <span>Export</span>
      </button>

      {#if isStreaming}
        <button
          type="button"
          onclick={cancel}
          class="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <span class="inline-block h-2 w-2 rounded-xs bg-rose-400"></span>
          <span>Abort</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Main View Area -->
  <div class="flex-1 overflow-hidden">
    {#if viewMode === "llm"}
      <LlmStreamView {tab} />
    {:else}
      <RawEventList {events} {isStreaming} />
    {/if}
  </div>
</div>
