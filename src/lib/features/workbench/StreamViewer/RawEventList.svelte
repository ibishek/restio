<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { SseEvent } from "#lib/types";
  import { highlightJson } from "#lib/utils/highlight";

  let { events, isStreaming }: { events: SseEvent[]; isStreaming: boolean } = $props();

  let searchQuery = $state("");
  let expandedRows = $state<Record<number, boolean>>({});
  let copiedId = $state<number | null>(null);

  const filteredEvents = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.data.toLowerCase().includes(q) ||
        e.eventType.toLowerCase().includes(q) ||
        (e.eventId && e.eventId.toLowerCase().includes(q)),
    );
  });

  function toggleRow(id: number) {
    expandedRows[id] = !expandedRows[id];
  }

  function toggleAll() {
    const allExpanded = events.every((e) => expandedRows[e.id]);
    const nextState = !allExpanded;
    const nextMap: Record<number, boolean> = {};
    for (const e of events) {
      nextMap[e.id] = nextState;
    }
    expandedRows = nextMap;
  }

  async function copyEventData(e: SseEvent) {
    await navigator.clipboard?.writeText(e.data);
    copiedId = e.id;
    setTimeout(() => {
      if (copiedId === e.id) copiedId = null;
    }, 1400);
  }

  function formatData(data: string): { isJson: boolean; text: string; html: string } {
    try {
      const parsed = JSON.parse(data);
      const pretty = JSON.stringify(parsed, null, 2);
      return { isJson: true, text: pretty, html: highlightJson(pretty) };
    } catch {
      return { isJson: false, text: data, html: "" };
    }
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-surface-base font-sans text-xs">
  <!-- Search & Filter bar -->
  <div class="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-subtle/50 px-4 py-2">
    <div class="relative flex-1 max-w-sm">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter events (data, type, ID)..."
        class="w-full rounded border border-border-subtle bg-surface-base py-1 pl-7 pr-3 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <div class="pointer-events-none absolute left-2 top-1.5 text-ink-faint">
        <Icon name="search" size={13} />
      </div>
      {#if searchQuery}
        <button
          type="button"
          onclick={() => (searchQuery = "")}
          class="absolute right-2 top-1.5 text-ink-faint hover:text-ink"
        >
          <Icon name="x" size={13} />
        </button>
      {/if}
    </div>

    <div class="flex items-center gap-2 text-ink-muted">
      <span>{filteredEvents.length} / {events.length} events</span>
      <span>·</span>
      <button
        type="button"
        onclick={toggleAll}
        class="rounded px-2 py-1 text-ink-muted hover:bg-surface-elevated hover:text-ink transition-colors"
      >
        Expand / Collapse all
      </button>
    </div>
  </div>

  <!-- Event rows list -->
  <div class="flex-1 overflow-y-auto divide-y divide-border-subtle/60">
    {#if filteredEvents.length === 0}
      <div class="flex h-48 items-center justify-center text-ink-faint">
        {events.length === 0
          ? isStreaming
            ? "Waiting for SSE events..."
            : "No SSE events captured."
          : "No events match your filter."}
      </div>
    {:else}
      {#each filteredEvents as event (event.id)}
        {@const formatted = formatData(event.data)}
        {@const isExpanded = expandedRows[event.id] ?? false}
        <div class="hover:bg-surface-elevated/30 transition-colors">
          <!-- Event Header Row -->
          <div
            role="button"
            tabindex="0"
            onclick={() => toggleRow(event.id)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleRow(event.id);
              }
            }}
            class="flex items-center gap-3 px-4 py-2 cursor-pointer select-none"
          >
            <div class="text-ink-faint">
              <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={13} />
            </div>

            <!-- Event Index -->
            <span class="w-8 font-mono text-[11px] text-ink-muted">#{event.id}</span>

            <!-- Latency / Delta -->
            <span class="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
              +{event.deltaMs}ms
            </span>

            <!-- Event Type Badge -->
            <span
              class="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium {event.eventType === 'message'
                ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}"
            >
              {event.eventType}
            </span>

            {#if event.eventId}
              <span class="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                id: {event.eventId}
              </span>
            {/if}

            <!-- One-line data preview if collapsed -->
            <div class="flex-1 truncate font-mono text-[11px] text-ink-muted/80">
              {event.data}
            </div>

            <!-- Action buttons -->
            <div class="flex items-center gap-1.5" onclick={(e) => e.stopPropagation()} role="presentation">
              <button
                type="button"
                onclick={() => copyEventData(event)}
                title="Copy event payload"
                class="rounded p-1 text-ink-faint hover:bg-surface-elevated hover:text-ink transition-colors"
              >
                <Icon
                  name={copiedId === event.id ? "check" : "copy"}
                  size={12}
                  class={copiedId === event.id ? "text-emerald-400" : ""}
                />
              </button>
            </div>
          </div>

          <!-- Expanded Payload Details -->
          {#if isExpanded}
            <div class="border-t border-border-subtle/40 bg-surface-base px-6 py-3 font-mono text-xs">
              {#if formatted.isJson}
                <pre class="overflow-x-auto whitespace-pre-wrap leading-relaxed"><code>{@html formatted.html}</code></pre>
              {:else}
                <div class="overflow-x-auto whitespace-pre-wrap leading-relaxed text-ink">
                  {event.data}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>
