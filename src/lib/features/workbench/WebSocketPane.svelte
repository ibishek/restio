<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { toast } from "#lib/components/ui/toasts.svelte";
  import { humanBytes } from "#lib/utils/format";
  import {
    clearWebSocketMessages,
    connectWebSocket,
    disconnectWebSocket,
    sendWebSocketMessage,
    sendWebSocketPing,
  } from "./stores/actions.svelte";
  import type { Tab } from "./stores/types";
  import type { WsMessageItem } from "#lib/types";

  let { tab }: { tab: Tab } = $props();

  let activeFilter = $state<"all" | "in" | "out" | "pingpong">("all");
  let searchQuery = $state("");
  let composerMode = $state<"json" | "text" | "binary">("json");
  let messageDraft = $state('{\n  "type": "hello",\n  "message": "Hello from RestIO!"\n}');
  let autoScroll = $state(true);
  let copiedId = $state<string | null>(null);
  let expandedIds = $state<Set<string>>(new Set());
  let messageContainerEl = $state<HTMLDivElement | null>(null);

  // Live timer for connection duration
  let now = $state(Date.now());
  $effect(() => {
    if (tab.wsState === "connected") {
      const interval = setInterval(() => {
        now = Date.now();
      }, 1000);
      return () => clearInterval(interval);
    }
  });

  const connectionDuration = $derived.by(() => {
    if (!tab.wsConnectedAt || tab.wsState !== "connected") return "00:00";
    const totalSecs = Math.max(0, Math.floor((now - tab.wsConnectedAt) / 1000));
    const mins = String(Math.floor(totalSecs / 60)).padStart(2, "0");
    const secs = String(totalSecs % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  });

  const stats = $derived.by(() => {
    let sentCount = 0;
    let recvCount = 0;
    let totalBytes = 0;

    for (const m of tab.wsMessages) {
      totalBytes += m.sizeBytes || 0;
      if (m.direction === "out") sentCount++;
      else recvCount++;
    }

    return { sentCount, recvCount, totalBytes };
  });

  const filteredMessages = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return tab.wsMessages.filter((m) => {
      // Direction / kind filter
      if (activeFilter === "in" && m.direction !== "in") return false;
      if (activeFilter === "out" && m.direction !== "out") return false;
      if (activeFilter === "pingpong" && m.kind !== "ping" && m.kind !== "pong") return false;

      // Text query
      if (q && !m.data.toLowerCase().includes(q)) return false;

      return true;
    });
  });

  // Auto-scroll on new messages
  $effect(() => {
    if (autoScroll && messageContainerEl && tab.wsMessages.length > 0) {
      messageContainerEl.scrollTop = messageContainerEl.scrollHeight;
    }
  });

  function toggleExpand(id: string) {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedIds = next;
  }

  async function copyMessagePayload(msg: WsMessageItem) {
    await navigator.clipboard?.writeText(msg.data);
    copiedId = msg.id;
    setTimeout(() => {
      if (copiedId === msg.id) copiedId = null;
    }, 1500);
    toast.success("Payload copied");
  }

  function handleFormatJson() {
    try {
      const parsed = JSON.parse(messageDraft);
      messageDraft = JSON.stringify(parsed, null, 2);
    } catch {
      toast.warn("Invalid JSON", "Cannot format malformed JSON payload");
    }
  }

  function handleSend() {
    if (!messageDraft.trim()) return;
    void sendWebSocketMessage(
      tab,
      messageDraft.trim(),
      composerMode === "binary" ? "binary" : "text",
    );
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  function formatTime(timestampMs: number): string {
    const d = new Date(timestampMs);
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  }

  function isJson(str: string): boolean {
    const trimmed = str.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  function prettyJson(str: string): string {
    try {
      return JSON.stringify(JSON.parse(str), null, 2);
    } catch {
      return str;
    }
  }
</script>

<div class="flex h-full flex-col overflow-hidden bg-surface-base font-sans">
  <!-- Top Status & Stats Toolbar -->
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-2 text-xs">
    <!-- Status & Timing -->
    <div class="flex items-center gap-3">
      {#if tab.wsState === "connected"}
        <div class="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-400 border border-emerald-500/20">
          <span class="inline-block h-2 w-2 animate-ping rounded-full bg-emerald-400"></span>
          <span class="font-medium">Connected</span>
          <span class="font-mono text-[11px] opacity-75">({connectionDuration})</span>
        </div>
      {:else if tab.wsState === "connecting"}
        <div class="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-400 border border-amber-500/20">
          <span class="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"></span>
          <span class="font-medium">Connecting...</span>
        </div>
      {:else if tab.wsState === "closing"}
        <div class="flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-2.5 py-1 text-yellow-400 border border-yellow-500/20">
          <span class="font-medium">Closing...</span>
        </div>
      {:else}
        <div class="flex items-center gap-1.5 rounded-full bg-surface-elevated px-2.5 py-1 text-ink-muted border border-border-subtle">
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-zinc-500"></span>
          <span class="font-medium">Disconnected</span>
        </div>
      {/if}

      <!-- Detailed Real-time Metrics -->
      <div class="hidden sm:flex items-center gap-2.5 font-mono text-[11px] text-ink-muted">
        <span class="text-sky-400">↓ {stats.recvCount} recv</span>
        <span>·</span>
        <span class="text-emerald-400">↑ {stats.sentCount} sent</span>
        <span>·</span>
        <span>{humanBytes(stats.totalBytes)}</span>
        {#if tab.wsLastPingRttMs !== null}
          <span>·</span>
          <span class="text-purple-400" title="Latest Ping/Pong Latency">RTT: {tab.wsLastPingRttMs}ms</span>
        {/if}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2">
      {#if tab.wsState === "connected"}
        <button
          type="button"
          onclick={() => void sendWebSocketPing(tab)}
          class="flex items-center gap-1 rounded bg-panel-2 border border-line px-2.5 py-1 text-xs text-ink hover:bg-hover transition-colors"
          title="Send a Ping frame to measure latency"
        >
          <Icon name="zap" size={13} />
          <span>Ping</span>
        </button>
        <button
          type="button"
          onclick={() => void disconnectWebSocket(tab)}
          class="flex items-center gap-1 rounded bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <Icon name="x" size={13} />
          <span>Disconnect</span>
        </button>
      {:else}
        <button
          type="button"
          onclick={() => void connectWebSocket(tab)}
          class="flex items-center gap-1 rounded bg-purple-500/15 border border-purple-500/30 px-3 py-1 text-xs font-medium text-purple-300 hover:bg-purple-500/25 transition-colors"
        >
          <Icon name="zap" size={13} />
          <span>Connect</span>
        </button>
      {/if}

      <button
        type="button"
        onclick={() => clearWebSocketMessages(tab)}
        disabled={tab.wsMessages.length === 0}
        class="flex items-center gap-1 rounded bg-panel-2 border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink hover:bg-hover transition-colors disabled:opacity-40"
        title="Clear message history"
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  </div>

  <!-- Messages Filter Bar -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/50 px-4 py-1.5 text-xs">
    <div class="flex items-center gap-1">
      <button
        type="button"
        onclick={() => (activeFilter = "all")}
        class="rounded px-2 py-0.5 transition-colors {activeFilter === 'all'
          ? 'bg-purple-500/20 text-purple-300 font-medium'
          : 'text-ink-muted hover:text-ink'}"
      >
        All ({tab.wsMessages.length})
      </button>
      <button
        type="button"
        onclick={() => (activeFilter = "in")}
        class="rounded px-2 py-0.5 transition-colors {activeFilter === 'in'
          ? 'bg-sky-500/20 text-sky-300 font-medium'
          : 'text-ink-muted hover:text-ink'}"
      >
        Incoming ({stats.recvCount})
      </button>
      <button
        type="button"
        onclick={() => (activeFilter = "out")}
        class="rounded px-2 py-0.5 transition-colors {activeFilter === 'out'
          ? 'bg-emerald-500/20 text-emerald-300 font-medium'
          : 'text-ink-muted hover:text-ink'}"
      >
        Outgoing ({stats.sentCount})
      </button>
      <button
        type="button"
        onclick={() => (activeFilter = "pingpong")}
        class="rounded px-2 py-0.5 transition-colors {activeFilter === 'pingpong'
          ? 'bg-purple-500/20 text-purple-300 font-medium'
          : 'text-ink-muted hover:text-ink'}"
      >
        Ping/Pong
      </button>
    </div>

    <div class="flex items-center gap-3">
      <!-- Search Input -->
      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Filter payload..."
          class="h-6 w-36 rounded border border-border-subtle bg-surface-base px-2 text-[11px] text-ink placeholder:text-ink-faint focus:border-purple-500 focus:outline-none"
        />
        {#if searchQuery}
          <button
            type="button"
            onclick={() => (searchQuery = "")}
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
          >
            <Icon name="x" size={11} />
          </button>
        {/if}
      </div>

      <!-- Auto-scroll Toggle -->
      <label class="flex items-center gap-1.5 cursor-pointer text-ink-muted hover:text-ink select-none text-[11px]">
        <input
          type="checkbox"
          bind:checked={autoScroll}
          class="rounded border-border-subtle text-purple-600 focus:ring-0"
        />
        <span>Auto-scroll</span>
      </label>
    </div>
  </div>

  <!-- Messages Timeline / Log List -->
  <div
    bind:this={messageContainerEl}
    class="flex-1 overflow-y-auto divide-y divide-border-subtle/50 font-mono text-xs"
  >
    {#if filteredMessages.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-ink-muted">
        <div class="rounded-full bg-purple-500/10 p-3 text-purple-400">
          <Icon name="globe" size={28} />
        </div>
        <p class="font-medium text-ink">No WebSocket messages</p>
        <p class="max-w-sm text-xs text-ink-muted">
          {#if tab.wsState === "connected"}
            Connected and listening for frames. Send a message below to start communicating.
          {:else}
            Click <strong>Connect</strong> above or in the request bar to open a connection to the WebSocket endpoint.
          {/if}
        </p>
      </div>
    {:else}
      {#each filteredMessages as msg (msg.id)}
        {@const isExpanded = expandedIds.has(msg.id)}
        {@const hasJson = isJson(msg.data)}
        <div class="group flex flex-col p-2.5 transition-colors hover:bg-surface-subtle/40">
          <!-- Row Header -->
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <!-- Direction Badge -->
              {#if msg.direction === "in"}
                <span class="inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400 border border-sky-500/20">
                  ↓ IN
                </span>
              {:else}
                <span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                  ↑ OUT
                </span>
              {/if}

              <!-- Kind Badge -->
              <span class="rounded bg-surface-elevated px-1.5 py-0.5 text-[10px] text-ink-muted border border-border-subtle">
                {msg.kind.toUpperCase()}
              </span>

              {#if msg.latencyMs !== undefined}
                <span class="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] text-purple-300 border border-purple-500/30">
                  {msg.latencyMs}ms RTT
                </span>
              {/if}

              <!-- Size -->
              {#if msg.sizeBytes > 0}
                <span class="text-[11px] text-ink-faint">
                  {humanBytes(msg.sizeBytes)}
                </span>
              {/if}
            </div>

            <!-- Timestamp & Quick Actions -->
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-ink-faint">
                {formatTime(msg.timestampMs)}
              </span>

              <button
                type="button"
                onclick={() => void copyMessagePayload(msg)}
                class="rounded p-1 text-ink-faint hover:text-ink hover:bg-hover opacity-0 group-hover:opacity-100 transition-opacity"
                title="Copy message payload"
              >
                {#if copiedId === msg.id}
                  <Icon name="check" size={12} class="text-emerald-400" />
                {:else}
                  <Icon name="copy" size={12} />
                {/if}
              </button>

              {#if hasJson || msg.data.length > 80}
                <button
                  type="button"
                  onclick={() => toggleExpand(msg.id)}
                  class="rounded p-1 text-ink-faint hover:text-ink hover:bg-hover"
                  title={isExpanded ? "Collapse message" : "Expand message"}
                >
                  <Icon
                    name="chevron-down"
                    size={12}
                    class={isExpanded ? "rotate-180 transition-transform" : "transition-transform"}
                  />
                </button>
              {/if}
            </div>
          </div>

          <!-- Payload Content -->
          <div class="mt-1.5">
            {#if hasJson && isExpanded}
              <pre class="overflow-x-auto rounded bg-surface-elevated/70 p-2 text-[11px] text-ink leading-relaxed border border-border-subtle"><code>{prettyJson(msg.data)}</code></pre>
            {:else}
              <div class="text-[11px] text-ink break-all {isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}">
                {msg.data}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Bottom Message Composer -->
  <div class="border-t border-border-subtle bg-surface-subtle p-3">
    <!-- Composer Mode Tabs & Helpers -->
    <div class="mb-2 flex items-center justify-between text-xs">
      <div class="flex rounded border border-border-subtle bg-surface-base p-0.5 text-[11px]">
        <button
          type="button"
          onclick={() => (composerMode = "json")}
          class="rounded px-2.5 py-0.5 transition-colors {composerMode === 'json'
            ? 'bg-purple-500/20 text-purple-300 font-medium'
            : 'text-ink-muted hover:text-ink'}"
        >
          JSON
        </button>
        <button
          type="button"
          onclick={() => (composerMode = "text")}
          class="rounded px-2.5 py-0.5 transition-colors {composerMode === 'text'
            ? 'bg-purple-500/20 text-purple-300 font-medium'
            : 'text-ink-muted hover:text-ink'}"
        >
          Plain Text
        </button>
        <button
          type="button"
          onclick={() => (composerMode = "binary")}
          class="rounded px-2.5 py-0.5 transition-colors {composerMode === 'binary'
            ? 'bg-purple-500/20 text-purple-300 font-medium'
            : 'text-ink-muted hover:text-ink'}"
        >
          Binary (Base64)
        </button>
      </div>

      <div class="flex items-center gap-2">
        {#if composerMode === "json"}
          <button
            type="button"
            onclick={handleFormatJson}
            class="text-[11px] text-ink-muted hover:text-ink hover:underline"
          >
            Format JSON
          </button>
        {/if}
        <span class="text-[10px] text-ink-faint">Ctrl+Enter to send</span>
      </div>
    </div>

    <!-- Message Textarea -->
    <div class="relative">
      <textarea
        bind:value={messageDraft}
        onkeydown={handleKeydown}
        placeholder={composerMode === "json"
          ? '{\n  "key": "value"\n}'
          : composerMode === "binary"
            ? "Enter Base64-encoded binary payload..."
            : "Enter text message..."}
        rows={3}
        class="w-full resize-y rounded border border-border-subtle bg-surface-base p-2.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-purple-500 focus:outline-none"
      ></textarea>
    </div>

    <!-- Send Button Bar -->
    <div class="mt-2 flex items-center justify-between">
      <div class="text-[11px] text-ink-faint">
        {#if tab.wsState !== "connected"}
          <span class="text-amber-400">Offline: Connect to server to send messages</span>
        {:else}
          <span class="text-emerald-400">Ready to send</span>
        {/if}
      </div>

      <button
        type="button"
        onclick={handleSend}
        disabled={tab.wsState !== "connected" || !messageDraft.trim()}
        class="flex items-center gap-1.5 rounded bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
      >
        <Icon name="send" size={13} />
        <span>Send</span>
      </button>
    </div>
  </div>
</div>
