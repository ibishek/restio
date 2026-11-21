<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { Tab } from "../stores/types";

  let { tab }: { tab: Tab } = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let autoScroll = $state(true);
  let userScrolledUp = $state(false);
  let copied = $state(false);

  const text = $derived(tab.streamText);
  const isStreaming = $derived(tab.isStreaming);
  const wordsCount = $derived(text.trim() ? text.trim().split(/\s+/).length : 0);
  const charsCount = $derived(text.length);

  // Auto-scroll when new text arrives, unless user scrolled up
  $effect(() => {
    void text;
    if (autoScroll && !userScrolledUp && containerEl) {
      containerEl.scrollTop = containerEl.scrollHeight;
    }
  });

  function handleScroll() {
    if (!containerEl) return;
    const { scrollTop, scrollHeight, clientHeight } = containerEl;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    // If user scrolled more than 50px away from bottom, mark as scrolled up
    userScrolledUp = distanceToBottom > 50;
  }

  function scrollToBottom() {
    if (containerEl) {
      containerEl.scrollTop = containerEl.scrollHeight;
      userScrolledUp = false;
      autoScroll = true;
    }
  }

  async function copyText() {
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }
</script>

<div class="relative flex h-full flex-col overflow-hidden bg-surface-base font-sans">
  <!-- Sub-bar with word/char counts and quick actions -->
  <div class="flex items-center justify-between border-b border-border-subtle bg-surface-subtle/50 px-4 py-2 text-xs text-ink-muted">
    <div class="flex items-center gap-3">
      <span>{wordsCount} words</span>
      <span>·</span>
      <span>{charsCount} chars</span>
      <span>·</span>
      <span>~{tab.streamMetrics.tokenCount} tokens</span>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        onclick={copyText}
        disabled={!text}
        class="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-muted hover:bg-surface-elevated hover:text-ink disabled:opacity-40 transition-colors"
      >
        <Icon name={copied ? "check" : "copy"} size={13} class={copied ? "text-emerald-400" : ""} />
        <span>{copied ? "Copied" : "Copy text"}</span>
      </button>
    </div>
  </div>

  <!-- Main streamed content viewport -->
  <div
    bind:this={containerEl}
    onscroll={handleScroll}
    class="relative flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-ink selection:bg-accent/25"
  >
    {#if !text && isStreaming}
      <div class="flex items-center gap-2 text-ink-muted">
        <span class="inline-block h-2 w-2 animate-ping rounded-full bg-accent"></span>
        <span>Waiting for first token...</span>
      </div>
    {:else if !text && !isStreaming}
      <div class="flex h-full items-center justify-center text-ink-faint">
        No stream output captured yet.
      </div>
    {:else}
      <div class="whitespace-pre-wrap break-words">
        {text}
        {#if isStreaming}
          <span class="inline-block h-4 w-2 animate-pulse bg-accent align-middle ml-0.5"></span>
        {/if}
      </div>
    {/if}

    <!-- Floating "Jump to bottom" button when user scrolled up -->
    {#if userScrolledUp}
      <button
        type="button"
        onclick={scrollToBottom}
        class="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1.5 text-xs font-medium text-ink shadow-lg hover:border-accent hover:text-accent transition-all"
      >
        <span>↓ Latest tokens</span>
      </button>
    {/if}
  </div>
</div>
