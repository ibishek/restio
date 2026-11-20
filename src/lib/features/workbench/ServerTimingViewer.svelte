<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { summarizeServerTiming, type ServerTimingMetric } from "#lib/utils/serverTiming";
  import { humanMs } from "#lib/utils/format";

  let {
    headers = {},
    clientRoundTripMs = 0,
  }: {
    headers?: Record<string, string>;
    clientRoundTripMs?: number;
  } = $props();

  const summary = $derived(summarizeServerTiming(headers, clientRoundTripMs));

  // Color palette for the segmented bar and breakdown list
  const PALETTE = [
    { bg: "bg-emerald-500", bar: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-500/20" },
    { bg: "bg-sky-500", bar: "bg-sky-500", text: "text-sky-400", border: "border-sky-500/20" },
    { bg: "bg-violet-500", bar: "bg-violet-500", text: "text-violet-400", border: "border-violet-500/20" },
    { bg: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/20" },
    { bg: "bg-rose-500", bar: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/20" },
    { bg: "bg-cyan-500", bar: "bg-cyan-500", text: "text-cyan-400", border: "border-cyan-500/20" },
    { bg: "bg-indigo-500", bar: "bg-indigo-500", text: "text-indigo-400", border: "border-indigo-500/20" },
  ];

  function getColor(index: number) {
    return PALETTE[index % PALETTE.length];
  }

  const timedMetrics = $derived(summary.metrics.filter((m) => typeof m.duration === "number"));
  const flagMetrics = $derived(summary.metrics.filter((m) => typeof m.duration !== "number"));

  function getPercentage(duration: number | undefined): number {
    if (typeof duration !== "number" || summary.totalServerDurationMs <= 0) return 0;
    return Math.round((duration / summary.totalServerDurationMs) * 1000) / 10;
  }

  let copiedSnippet = $state(false);

  const exampleHeader =
    'Server-Timing: cache;desc="Cache Read";dur=14.2, db;dur=65.4;desc="Database Query", app;dur=32.1';

  async function copyExample() {
    try {
      await navigator.clipboard.writeText(exampleHeader);
      copiedSnippet = true;
      setTimeout(() => (copiedSnippet = false), 1500);
    } catch {
      // ignore
    }
  }
</script>

<div class="flex-1 overflow-y-auto p-4 space-y-5">
  <!-- 1. Top KPI Summary Cards -->
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <!-- Card 1: Client Round-Trip -->
    <div class="rounded-lg border border-line bg-panel p-3.5 shadow-sm">
      <div class="flex items-center justify-between text-ink-muted">
        <span class="text-xs font-medium">Round-Trip Latency</span>
        <Icon name="clock" size={14} class="text-ink-faint" />
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="font-mono text-xl font-bold tabular-nums text-ink">
          {humanMs(summary.clientRoundTripMs)}
        </span>
      </div>
      <p class="mt-1 text-11 text-ink-faint">Client-observed duration</p>
    </div>

    <!-- Card 2: Server Execution -->
    <div class="rounded-lg border border-line bg-panel p-3.5 shadow-sm">
      <div class="flex items-center justify-between text-ink-muted">
        <span class="text-xs font-medium">Server Execution</span>
        <Icon name="zap" size={14} class={summary.hasTimings ? "text-brand" : "text-ink-faint"} />
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="font-mono text-xl font-bold tabular-nums {summary.hasTimings ? 'text-brand' : 'text-ink-muted'}">
          {summary.hasTimings ? humanMs(summary.totalServerDurationMs) : "Not reported"}
        </span>
      </div>
      <p class="mt-1 text-11 text-ink-faint">
        {#if summary.hasTimings && summary.clientRoundTripMs > 0}
          {Math.min(100, Math.round((summary.totalServerDurationMs / summary.clientRoundTripMs) * 100))}% of total round-trip
        {:else}
          Via Server-Timing header
        {/if}
      </p>
    </div>

    <!-- Card 3: Network & Gateway Overhead -->
    <div class="rounded-lg border border-line bg-panel p-3.5 shadow-sm">
      <div class="flex items-center justify-between text-ink-muted">
        <span class="text-xs font-medium">Network & Gateway</span>
        <Icon name="globe" size={14} class="text-sky-400" />
      </div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="font-mono text-xl font-bold tabular-nums text-sky-400">
          {humanMs(summary.networkLatencyMs)}
        </span>
      </div>
      <p class="mt-1 text-11 text-ink-faint">
        {#if summary.clientRoundTripMs > 0}
          {Math.min(100, Math.round((summary.networkLatencyMs / summary.clientRoundTripMs) * 100))}% transfer, DNS & TLS
        {:else}
          Transfer overhead
        {/if}
      </p>
    </div>
  </div>

  {#if summary.hasTimings}
    <!-- 2. Horizontal Segmented Bar (Server Time Budget) -->
    <div class="rounded-lg border border-line bg-panel p-4 shadow-sm space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="zap" size={14} class="text-brand" />
          <h4 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Server Budget Breakdown
          </h4>
        </div>
        <span class="font-mono text-11 text-ink-faint tabular-nums">
          {summary.totalServerDurationMs} ms total
        </span>
      </div>

      <!-- Segmented Bar -->
      <div class="h-4.5 w-full overflow-hidden rounded-md bg-panel-2 flex border border-line-strong/40">
        {#each timedMetrics as metric, i (metric.name + i)}
          {@const pct = getPercentage(metric.duration)}
          {@const color = getColor(i)}
          {#if pct > 0}
            <div
              class="{color.bar} h-full transition-all duration-300 relative group cursor-pointer border-r border-canvas/40 last:border-r-0"
              style="width: {pct}%"
              title="{metric.name}: {metric.duration} ms ({pct}%)"
            ></div>
          {/if}
        {/each}
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-xs">
        {#each timedMetrics as metric, i (metric.name + i)}
          {@const pct = getPercentage(metric.duration)}
          {@const color = getColor(i)}
          <div class="flex items-center gap-1.5">
            <span class="size-2 rounded-full {color.bg}"></span>
            <span class="font-medium text-ink">{metric.name}</span>
            <span class="font-mono text-ink-muted tabular-nums">{metric.duration} ms</span>
            <span class="text-10 text-ink-faint tabular-nums">({pct}%)</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- 3. Detailed Metric Breakdown List -->
    <div class="rounded-lg border border-line bg-panel p-4 shadow-sm space-y-3">
      <div class="flex items-center gap-2 border-b border-line pb-2.5">
        <Icon name="clock" size={14} class="text-ink-muted" />
        <h4 class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Metric Details
        </h4>
      </div>

      <div class="divide-y divide-line/60">
        {#each timedMetrics as metric, i (metric.name + i)}
          {@const pct = getPercentage(metric.duration)}
          {@const color = getColor(i)}
          <div class="py-3 first:pt-1 last:pb-1 space-y-1.5">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2 min-w-0">
                <span class="size-2 rounded-full {color.bg} shrink-0"></span>
                <span class="font-mono font-semibold text-ink truncate">{metric.name}</span>
                {#if metric.description}
                  <span class="text-ink-muted truncate">— {metric.description}</span>
                {/if}
              </div>

              <div class="flex items-center gap-3 shrink-0 pl-3">
                <span class="font-mono font-medium text-ink tabular-nums">
                  {metric.duration} ms
                </span>
                <span class="w-12 text-right font-mono text-11 text-ink-faint tabular-nums">
                  {pct}%
                </span>
              </div>
            </div>

            <!-- Proportional sub-bar -->
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
              <div
                class="{color.bar} h-full rounded-full transition-all duration-300"
                style="width: {pct}%"
              ></div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Flags and Events (if any) -->
      {#if flagMetrics.length > 0}
        <div class="border-t border-line pt-3 mt-3 space-y-2">
          <h5 class="text-11 font-semibold uppercase tracking-wider text-ink-faint">
            Flags & Status Events
          </h5>
          <div class="flex flex-wrap gap-2">
            {#each flagMetrics as flag (flag.name)}
              <span
                class="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2.5 py-1 text-xs font-mono text-ink"
              >
                <span class="size-1.5 rounded-full bg-ink-faint"></span>
                <span>{flag.name}</span>
                {#if flag.description}
                  <span class="text-ink-muted">({flag.description})</span>
                {/if}
              </span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- 4. Empty / Educational Guidance State -->
    <div class="rounded-lg border border-dashed border-line bg-panel/50 p-6 text-center space-y-3">
      <div class="mx-auto grid size-10 place-items-center rounded-full bg-panel-2 text-ink-muted">
        <Icon name="info" size={20} class="text-sky-400" />
      </div>
      <div>
        <h4 class="text-sm font-semibold text-ink">No Server-Timing Header Found</h4>
        <p class="mx-auto mt-1 max-w-md text-xs text-ink-muted">
          The server did not return a <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-sky-400">Server-Timing</code> header.
          You can measure database queries, cache lookups, and handlers by returning it from your API.
        </p>
      </div>

      <!-- Example Header Snippet -->
      <div class="mx-auto max-w-lg rounded-md border border-line bg-canvas p-3 text-left">
        <div class="flex items-center justify-between pb-1.5 border-b border-line/60">
          <span class="text-10 font-semibold uppercase tracking-wider text-ink-faint">
            Header Example
          </span>
          <button
            type="button"
            onclick={copyExample}
            class="flex items-center gap-1 text-11 text-ink-muted hover:text-ink transition-colors"
          >
            <Icon name={copiedSnippet ? "check" : "copy"} size={12} class={copiedSnippet ? "text-brand" : ""} />
            <span>{copiedSnippet ? "Copied" : "Copy"}</span>
          </button>
        </div>
        <pre class="mt-2 overflow-x-auto font-mono text-11 text-brand leading-relaxed select-all">{exampleHeader}</pre>
      </div>
    </div>
  {/if}
</div>
