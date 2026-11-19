<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { CODE_TARGETS, generateCode, type CodeTarget } from "#lib/utils/codegen";
  import { resolveRequest } from "#lib/utils/interpolate";
  import {
    activeTab,
    activeEnvironment,
    activeEnvName,
    composePath,
    effectiveAuth,
  } from "./state.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const tab = $derived(activeTab()!); // mounted within RequestPanel — a tab is always open

  let target = $state<CodeTarget>("curl");
  let resolveVars = $state(true);
  let copied = $state(false);
  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();

  // Focus the search box when the dialog opens.
  $effect(() => {
    if (open) searchInput?.focus();
  });

  // Targets grouped by language, filtered by the search box (matches language +
  // label, so "flutter" finds Dart, "swift" finds Swift, etc.).
  const groups = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const out: { lang: string; items: typeof CODE_TARGETS }[] = [];
    for (const t of CODE_TARGETS) {
      if (q && !`${t.lang} ${t.label}`.toLowerCase().includes(q)) continue;
      let g = out.find((x) => x.lang === t.lang);
      if (!g) {
        g = { lang: t.lang, items: [] };
        out.push(g);
      }
      g.items.push(t);
    }
    return out;
  });

  const activeLabel = $derived.by(() => {
    const t = CODE_TARGETS.find((x) => x.id === target);
    return t ? `${t.lang} · ${t.label}` : "";
  });

  // Generated snippet for the current request + target. Resolves {{vars}} against
  // the active environment unless the user opts out (raw template).
  const snippet = $derived.by(() => {
    const req = $state.snapshot(tab.request);
    req.url = composePath(req.url); // apply collection base URL + folder prefixes
    req.auth = effectiveAuth(tab.requestLocation, req.auth); // resolve inherited auth
    return generateCode(target, resolveVars ? resolveRequest(req, activeEnvironment()) : req);
  });

  const hasEnv = $derived(activeEnvironment() !== null);

  function close() {
    open = false;
    query = "";
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      copied = true;
      setTimeout(() => (copied = false), 1400);
    } catch {
      // Clipboard API unavailable — the user can still select the text manually.
    }
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
      aria-labelledby="code-dialog-title"
      class="flex h-modal max-h-modal w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <!-- Header -->
      <div class="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon name="code" size={15} class="text-ink-muted" />
        <span id="code-dialog-title" class="text-sm font-semibold">Generate code</span>
        <span class="text-11 text-ink-faint">· {activeLabel}</span>
        <button
          onclick={copy}
          class="ml-auto flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
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
          onclick={close}
          aria-label="Close"
          class="grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <!-- Body: language list (left) + snippet (right) -->
      <div class="flex min-h-0 flex-1">
        <!-- Language picker -->
        <aside class="flex w-52 shrink-0 flex-col border-r border-line bg-canvas/30">
          <div class="p-2">
            <div class="relative">
              <span class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint">
                <Icon name="search" size={13} />
              </span>
              <input
                bind:this={searchInput}
                bind:value={query}
                type="text"
                placeholder="Search language…"
                spellcheck="false"
                class="w-full rounded-md border border-line bg-panel-2/70 py-1.5 pr-2 pl-7 text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
              />
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {#each groups as group (group.lang)}
              <div class="mb-1">
                <p class="px-2 py-1 text-10 font-semibold tracking-wide text-ink-faint uppercase">
                  {group.lang}
                </p>
                {#each group.items as t (t.id)}
                  <button
                    onclick={() => (target = t.id)}
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 transition-colors"
                    class:bg-panel-2={target === t.id}
                    class:text-ink={target === t.id}
                    class:text-ink-muted={target !== t.id}
                    class:hover:bg-panel-2={target !== t.id}
                  >
                    <span
                      class="size-1 shrink-0 rounded-full"
                      class:bg-brand={target === t.id}
                      class:bg-transparent={target !== t.id}
                    ></span>
                    <span class="min-w-0 flex-1 truncate">{t.label}</span>
                  </button>
                {/each}
              </div>
            {/each}
            {#if groups.length === 0}
              <p class="px-2 py-6 text-center text-11 text-ink-faint">No language matches “{query}”.</p>
            {/if}
          </div>
        </aside>

        <!-- Snippet -->
        <div class="min-h-0 flex-1 overflow-auto bg-canvas/40">
          <pre class="p-4 font-mono text-13 leading-relaxed whitespace-pre text-ink"><code>{snippet}</code></pre>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex h-11 shrink-0 items-center gap-2 border-t border-line px-3 text-xs">
        <label class="flex items-center gap-2 text-ink-muted">
          <input type="checkbox" bind:checked={resolveVars} class="size-3.5 accent-brand" />
          Resolve environment variables
        </label>
        {#if resolveVars && hasEnv}
          <span class="ml-auto flex items-center gap-1 text-ink-faint">
            <Icon name="globe" size={12} />
            values from “{activeEnvName()}”
          </span>
        {/if}
      </div>
    </div>
  </div>
{/if}
