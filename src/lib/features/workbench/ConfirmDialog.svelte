<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { wb } from "./state.svelte";

  function cancel() {
    wb.confirm = null;
  }
  function discard() {
    const c = wb.confirm;
    wb.confirm = null;
    c?.onDiscard?.();
  }
  function confirm() {
    const c = wb.confirm;
    wb.confirm = null;
    c?.onConfirm();
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") cancel();
  }
</script>

<svelte:window onkeydown={wb.confirm ? onKeydown : undefined} />

{#if wb.confirm}
  {@const c = wb.confirm}
  <div
    class="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) cancel();
    }}
  >
    <div
      use:focusTrap
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      class="w-full max-w-sm overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <div class="flex items-start gap-3 p-4">
        <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
          <Icon name="alert-triangle" size={16} />
        </span>
        <div class="min-w-0">
          <h2 id="confirm-title" class="text-sm font-semibold text-ink">{c.title}</h2>
          <p class="mt-1 text-13 leading-relaxed text-ink-muted">{c.message}</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
        <button
          onclick={cancel}
          class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          Cancel
        </button>
        {#if c.discardLabel}
          <button
            onclick={discard}
            class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            {c.discardLabel}
          </button>
        {/if}
        <button
          onclick={confirm}
          class="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-brand-strong active:scale-95"
        >
          {c.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
