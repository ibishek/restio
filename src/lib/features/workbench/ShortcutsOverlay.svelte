<script lang="ts">
  import { browser } from "$app/env";
  import Icon from "#lib/components/ui/Icon.svelte";
  import { focusTrap } from "#lib/utils/focusTrap";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const isMac = browser && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const mod = isMac ? "⌘" : "Ctrl";

  // Each keys[] entry renders as its own <kbd>. Grouped for scannability.
  const groups: { title: string; items: { keys: string[]; label: string }[] }[] = [
    {
      title: "Requests",
      items: [
        { keys: [mod, "↵"], label: "Send request" },
        { keys: [mod, "S"], label: "Save request" },
        { keys: ["Esc"], label: "Cancel in-flight request" },
      ],
    },
    {
      title: "Tabs",
      items: [
        { keys: [mod, "N"], label: "New request tab" },
        { keys: [mod, "W"], label: "Close tab" },
      ],
    },
    {
      title: "Navigation",
      items: [
        { keys: [mod, "K"], label: "Command palette / Search" },
        { keys: [mod, "B"], label: "Toggle sidebar" },
        { keys: ["?"], label: "Show this help" },
      ],
    },
  ];

  const close = () => (open = false);
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={open ? onKeydown : undefined} />

{#if open}
  <div
    class="fixed inset-0 z-overlay flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      use:focusTrap
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      class="w-full max-w-md overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-4">
        <Icon name="keyboard" size={16} class="text-ink-muted" />
        <span id="shortcuts-title" class="text-sm font-semibold">Keyboard shortcuts</span>
        <button
          onclick={close}
          aria-label="Close"
          class="ml-auto grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="space-y-4 p-4">
        {#each groups as group (group.title)}
          <div>
            <h3 class="mb-2 text-11 font-semibold tracking-wide text-ink-faint uppercase">
              {group.title}
            </h3>
            <ul class="space-y-1">
              {#each group.items as item (item.label)}
                <li class="flex items-center justify-between gap-4 rounded-md px-1 py-1">
                  <span class="text-13 text-ink-muted">{item.label}</span>
                  <span class="flex shrink-0 items-center gap-1">
                    {#each item.keys as key (key)}
                      <kbd
                        class="grid h-6 min-w-6 place-items-center rounded border border-line-strong bg-panel-2 px-1.5 font-mono text-11 font-medium text-ink shadow-sm"
                      >
                        {key}
                      </kbd>
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}
