<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { browser } from "$app/env";
  import Icon from "./Icon.svelte";
  import { toasts, dismissToast, type ToastKind } from "./toasts.svelte";

  // Honour reduced-motion: skip the slide/fade entirely when requested.
  const reduced =
    browser && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;

  const kinds: Record<ToastKind, { icon: "check" | "alert-triangle" | "info"; accent: string }> = {
    success: { icon: "check", accent: "text-brand" },
    error: { icon: "alert-triangle", accent: "text-danger" },
    warn: { icon: "alert-triangle", accent: "text-warn" },
    info: { icon: "info", accent: "text-sky-400" },
  };
</script>

<!-- Toasts sit above every modal (z-50/60) and never steal focus (aria-live). -->
<div
  class="pointer-events-none fixed right-4 bottom-4 z-toast flex w-80 max-w-toast flex-col gap-2"
  role="status"
  aria-live="polite"
  aria-atomic="false"
>
  {#each toasts as t (t.id)}
    <div
      in:fly={{ y: 10, duration: 180 * reduced }}
      out:fade={{ duration: 120 * reduced }}
      class="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-panel/95 p-3 shadow-2xl shadow-black/50 backdrop-blur"
    >
      <span class="mt-px shrink-0 {kinds[t.kind].accent}">
        <Icon name={kinds[t.kind].icon} size={16} />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-13 font-medium text-ink">{t.message}</p>
        {#if t.detail}
          <p class="mt-0.5 text-11 break-words text-ink-muted">{t.detail}</p>
        {/if}
      </div>
      <button
        onclick={() => dismissToast(t.id)}
        aria-label="Dismiss notification"
        class="-mt-0.5 -mr-0.5 grid size-6 shrink-0 place-items-center rounded text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  {/each}
</div>
