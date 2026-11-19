<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "#lib/components/ui/Icon.svelte";
  import VarInput from "./VarInput.svelte";
  import type { AuthType, RequestAuth } from "#lib/types";

  let {
    auth = $bindable(),
    allowInherit = false,
    compact = false,
    onchange,
    inheritNote,
  }: {
    auth: RequestAuth;
    /** Offer the "Inherit" option (requests + folders; a root collection can
     *  still pick it, it just resolves to no auth). */
    allowInherit?: boolean;
    /** Tighter spacing for the sidebar settings panel. */
    compact?: boolean;
    /** Called after any edit — use to persist immediately (e.g. folder auth). */
    onchange?: () => void;
    /** Rendered in place of fields when type is "inherit" (e.g. the source hint). */
    inheritNote?: Snippet;
  } = $props();

  const types: { id: AuthType; label: string }[] = $derived([
    ...(allowInherit ? [{ id: "inherit" as AuthType, label: "Inherit" }] : []),
    { id: "none", label: "No Auth" },
    { id: "bearer", label: "Bearer Token" },
    { id: "basic", label: "Basic Auth" },
    { id: "apikey", label: "API Key" },
  ]);

  function setType(t: AuthType) {
    auth.type = t;
    onchange?.();
  }

  const fieldCls = $derived(
    compact
      ? "h-7 w-full rounded border border-line bg-panel px-2 font-mono text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
      : "h-9 w-full rounded-lg border border-line bg-panel-2/60 px-3 font-mono text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none",
  );
</script>

<div class={compact ? "space-y-2" : "space-y-3"}>
  <!-- Type selector -->
  <div role="radiogroup" aria-label="Authorization type" class="flex flex-wrap items-center gap-1">
    {#each types as t (t.id)}
      <button
        role="radio"
        aria-checked={auth.type === t.id}
        onclick={() => setType(t.id)}
        class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
        class:border-brand={auth.type === t.id}
        class:bg-brand={auth.type === t.id}
        class:text-slate-950={auth.type === t.id}
        class:border-line={auth.type !== t.id}
        class:text-ink-muted={auth.type !== t.id}
        class:hover:border-line-strong={auth.type !== t.id}
      >
        {t.label}
      </button>
    {/each}
  </div>

  {#if auth.type === "inherit"}
    {#if inheritNote}
      {@render inheritNote()}
    {:else}
      <p class="py-3 text-center text-11 text-ink-faint">
        Uses the parent folder/collection's auth (none at the top level).
      </p>
    {/if}
  {:else if auth.type === "none"}
    <p class="py-4 text-center text-sm text-ink-faint">No authorization is applied.</p>
  {:else}
    {#if auth.type === "bearer"}
      <label class="block">
        <span class="mb-1 block text-11 font-medium tracking-wide text-ink-faint uppercase">Token</span>
        <VarInput bind:value={auth.bearer.token} {onchange} placeholder="Token or {'{{'}token{'}}'}" class={fieldCls} />
      </label>
    {:else if auth.type === "basic"}
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-11 font-medium tracking-wide text-ink-faint uppercase">Username</span>
          <VarInput bind:value={auth.basic.username} {onchange} placeholder="Username" class={fieldCls} />
        </label>
        <label class="block">
          <span class="mb-1 block text-11 font-medium tracking-wide text-ink-faint uppercase">Password</span>
          <VarInput bind:value={auth.basic.password} {onchange} placeholder="Password" class={fieldCls} />
        </label>
      </div>
    {:else if auth.type === "apikey"}
      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-11 font-medium tracking-wide text-ink-faint uppercase">Key</span>
          <VarInput bind:value={auth.apiKey.key} {onchange} placeholder="X-API-Key" class={fieldCls} />
        </label>
        <label class="block">
          <span class="mb-1 block text-11 font-medium tracking-wide text-ink-faint uppercase">Value</span>
          <VarInput bind:value={auth.apiKey.value} {onchange} placeholder="Value or {'{{'}api_key{'}}'}" class={fieldCls} />
        </label>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-11 font-medium tracking-wide text-ink-faint uppercase">Add to</span>
        {#each ["header", "query"] as loc (loc)}
          <button
            onclick={() => {
              auth.apiKey.addTo = loc as "header" | "query";
              onchange?.();
            }}
            class="rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
            class:border-brand={auth.apiKey.addTo === loc}
            class:text-brand={auth.apiKey.addTo === loc}
            class:border-line={auth.apiKey.addTo !== loc}
            class:text-ink-muted={auth.apiKey.addTo !== loc}
          >
            {loc === "header" ? "Header" : "Query param"}
          </button>
        {/each}
      </div>
    {/if}
    <p class="flex items-start gap-1.5 text-11 leading-relaxed text-ink-faint">
      <Icon name="globe" size={12} class="mt-0.5 shrink-0" />
      <span>
        Values support <span class="font-mono">{"{{vars}}"}</span> from the active environment and are
        applied at send time. Reference secrets as variables — this config is saved with the
        collection and shared.
      </span>
    </p>
  {/if}
</div>
