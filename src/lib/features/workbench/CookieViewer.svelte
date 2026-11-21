<script lang="ts">
  import type { Cookie } from "#lib/types";

  let {
    cookies = [],
    onManageCookies,
  }: {
    cookies?: Cookie[];
    onManageCookies?: () => void;
  } = $props();

  let filter = $state("");
  let copiedId = $state<string | null>(null);
  let copiedHeader = $state(false);

  const filteredCookies = $derived.by(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cookies;
    return cookies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.value.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.path.toLowerCase().includes(q),
    );
  });

  async function copyValue(c: Cookie) {
    await navigator.clipboard.writeText(c.value);
    copiedId = c.id;
    setTimeout(() => {
      if (copiedId === c.id) copiedId = null;
    }, 1500);
  }

  async function copyHeaderString() {
    const str = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    await navigator.clipboard.writeText(str);
    copiedHeader = true;
    setTimeout(() => {
      copiedHeader = false;
    }, 1500);
  }

  function formatExpiry(exp?: number, maxAge?: number): string {
    if (exp) {
      const date = new Date(exp * 1000);
      return date.toLocaleString();
    }
    if (maxAge !== undefined) {
      if (maxAge <= 0) return "Expired (Max-Age=0)";
      return `${maxAge}s`;
    }
    return "Session";
  }
</script>

<div class="space-y-4">
  <!-- Top bar with search and actions -->
  <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
    <div class="flex items-center gap-2">
      <input
        type="search"
        placeholder="Filter response cookies..."
        bind:value={filter}
        class="h-8 w-60 rounded border border-line bg-panel-2 px-2.5 text-xs text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
      />
      {#if filter}
        <span class="text-xs text-ink-faint">
          {filteredCookies.length} of {cookies.length}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if cookies.length > 0}
        <button
          type="button"
          onclick={copyHeaderString}
          class="flex items-center gap-1.5 rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-hover transition-colors"
          title="Copy as 'Cookie: name=val' header string"
        >
          {#if copiedHeader}
            <span class="text-emerald-400">✓ Copied</span>
          {:else}
            <span>📋 Copy as Cookie Header</span>
          {/if}
        </button>
      {/if}

      {#if onManageCookies}
        <button
          type="button"
          onclick={onManageCookies}
          class="flex items-center gap-1 rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-hover hover:border-line-strong transition-colors"
        >
          <span>Manage Workspace Cookies ↗</span>
        </button>
      {/if}
    </div>
  </div>

  {#if cookies.length === 0}
    <div class="flex flex-col items-center justify-center py-12 text-center">
      <div class="rounded-full bg-panel-2 p-3 text-ink-faint mb-2">🍪</div>
      <p class="text-sm font-medium text-ink">No cookies received in this response</p>
      <p class="mt-1 text-xs text-ink-faint max-w-sm">
        The server did not send any <code>Set-Cookie</code> headers. If session cookies are already saved for this domain, they will be sent automatically.
      </p>
      {#if onManageCookies}
        <button
          type="button"
          onclick={onManageCookies}
          class="mt-4 text-xs font-medium text-brand hover:underline"
        >
          View all cookies in workspace jar →
        </button>
      {/if}
    </div>
  {:else if filteredCookies.length === 0}
    <div class="py-8 text-center text-xs text-ink-faint">
      No cookies match your filter.
    </div>
  {:else}
    <div class="overflow-x-auto rounded-lg border border-line">
      <table class="w-full text-left text-xs">
        <thead class="border-b border-line bg-panel-2 font-medium text-ink-muted">
          <tr>
            <th class="px-3.5 py-2.5">Name</th>
            <th class="px-3.5 py-2.5">Value</th>
            <th class="px-3.5 py-2.5">Domain</th>
            <th class="px-3.5 py-2.5">Path</th>
            <th class="px-3.5 py-2.5">Expires</th>
            <th class="px-3.5 py-2.5 text-right">Attributes</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line bg-panel">
          {#each filteredCookies as c (c.id)}
            <tr class="hover:bg-hover/50 transition-colors">
              <td class="px-3.5 py-2 font-mono font-medium text-ink">
                {c.name}
              </td>
              <td class="px-3.5 py-2 font-mono text-ink-muted max-w-xs truncate" title={c.value}>
                <div class="flex items-center gap-1.5">
                  <span class="truncate">{c.value}</span>
                  <button
                    type="button"
                    onclick={() => copyValue(c)}
                    class="shrink-0 text-10 text-ink-faint hover:text-ink px-1 rounded hover:bg-hover"
                    title="Copy cookie value"
                  >
                    {copiedId === c.id ? "✓" : "📋"}
                  </button>
                </div>
              </td>
              <td class="px-3.5 py-2 text-ink-muted font-mono">{c.domain}</td>
              <td class="px-3.5 py-2 text-ink-muted font-mono">{c.path}</td>
              <td class="px-3.5 py-2 text-ink-faint whitespace-nowrap">
                {formatExpiry(c.expires, c.maxAge)}
              </td>
              <td class="px-3.5 py-2 text-right whitespace-nowrap">
                <div class="inline-flex items-center gap-1">
                  {#if c.httpOnly}
                    <span
                      class="rounded bg-amber-500/15 px-1.5 py-0.5 text-10 font-medium text-amber-400"
                      title="HttpOnly: Not accessible to browser document.cookie"
                    >
                      HttpOnly
                    </span>
                  {/if}
                  {#if c.secure}
                    <span
                      class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-10 font-medium text-emerald-400"
                      title="Secure: Transmitted only over HTTPS"
                    >
                      Secure
                    </span>
                  {/if}
                  {#if c.sameSite}
                    <span
                      class="rounded bg-sky-500/15 px-1.5 py-0.5 text-10 font-medium text-sky-400"
                      title="SameSite={c.sameSite}"
                    >
                      {c.sameSite}
                    </span>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
