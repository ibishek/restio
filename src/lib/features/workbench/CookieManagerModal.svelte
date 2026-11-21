<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { Cookie } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { getCookies, saveCookie, deleteCookie, clearCookies } from "#lib/ipc";
  import { wb } from "./state.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let cookies = $state<Cookie[]>([]);
  let loading = $state(false);
  let filter = $state("");
  let selectedDomain = $state<string | null>(null);

  // Add Cookie form state
  let addingCookie = $state(false);
  let newName = $state("");
  let newValue = $state("");
  let newDomain = $state("");
  let newPath = $state("/");
  let newHttpOnly = $state(false);
  let newSecure = $state(false);
  let newSameSite = $state("");

  async function load() {
    loading = true;
    try {
      cookies = await getCookies();
      if (!selectedDomain && domains.length > 0) {
        selectedDomain = domains[0];
      }
    } catch (err) {
      console.error("Failed to load cookies", err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) {
      load();
    }
  });

  const domains = $derived.by(() => {
    const set = new Set<string>();
    for (const c of cookies) {
      if (c.domain) set.add(c.domain);
    }
    return Array.from(set).toSorted();
  });

  const domainCounts = $derived.by(() => {
    const map = new Map<string, number>();
    for (const c of cookies) {
      map.set(c.domain, (map.get(c.domain) ?? 0) + 1);
    }
    return map;
  });

  const displayedCookies = $derived.by(() => {
    let list = cookies;
    if (selectedDomain) {
      list = list.filter((c) => c.domain === selectedDomain);
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.value.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.path.toLowerCase().includes(q),
    );
  });

  function close() {
    open = false;
    addingCookie = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  async function handleDelete(id: string) {
    await deleteCookie(id);
    cookies = cookies.filter((c) => c.id !== id);
    if (selectedDomain && !cookies.some((c) => c.domain === selectedDomain)) {
      selectedDomain = domains[0] ?? null;
    }
  }

  async function handleClearDomain(dom: string) {
    if (!confirm(`Are you sure you want to clear all cookies for ${dom}?`)) return;
    await clearCookies(dom);
    cookies = cookies.filter((c) => c.domain !== dom);
    selectedDomain = domains[0] ?? null;
  }

  async function handleClearAll() {
    if (!confirm("Are you sure you want to purge all cookies for this entire workspace?")) return;
    await clearCookies();
    cookies = [];
    selectedDomain = null;
  }

  async function handleSaveNew() {
    if (!newName.trim() || !newDomain.trim()) return;
    const cookie: Cookie = {
      id: `ck-${Date.now()}`,
      workspaceId: wb.activeWorkspaceId ?? "default",
      domain: newDomain.trim().toLowerCase(),
      path: newPath.trim() || "/",
      name: newName.trim(),
      value: newValue,
      httpOnly: newHttpOnly,
      secure: newSecure,
      sameSite: newSameSite,
      createdAt: Math.floor(Date.now() / 1000),
    };
    await saveCookie(cookie);
    await load();
    selectedDomain = cookie.domain;
    addingCookie = false;
    newName = "";
    newValue = "";
  }

  function startAddCookie() {
    newDomain = selectedDomain || "localhost";
    newPath = "/";
    newName = "";
    newValue = "";
    newHttpOnly = false;
    newSecure = false;
    newSameSite = "";
    addingCookie = true;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
    onkeydown={onKeydown}
    tabindex="-1"
  >
    <div
      use:focusTrap
      class="flex h-[80vh] w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      <!-- Dialog Header -->
      <div class="flex items-center justify-between border-b border-line px-5 py-3.5 bg-panel-2">
        <div class="flex items-center gap-2.5">
          <span class="text-base">🍪</span>
          <div>
            <h2 class="text-sm font-semibold text-ink">Cookie Jar & Session Manager</h2>
            <p class="text-xs text-ink-faint">
              Persisted per-workspace in SQLite. Automatically matches outbound domain requests.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if cookies.length > 0}
            <button
              type="button"
              onclick={handleClearAll}
              class="rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              Purge All Cookies
            </button>
          {/if}
          <button
            type="button"
            onclick={close}
            class="rounded p-1 text-ink-muted hover:bg-hover hover:text-ink transition-colors"
            aria-label="Close dialog"
          >
            <Icon name="x" class="size-4" />
          </button>
        </div>
      </div>

      <!-- Split body -->
      <div class="flex flex-1 min-h-0 divide-x divide-line">
        <!-- Domains Sidebar -->
        <div class="w-56 shrink-0 flex flex-col bg-panel-2/50 overflow-y-auto p-3 space-y-1">
          <div class="flex items-center justify-between px-2 py-1 text-10 font-semibold uppercase tracking-wider text-ink-faint">
            <span>Domains ({domains.length})</span>
            <button
              type="button"
              onclick={startAddCookie}
              class="text-ink-muted hover:text-ink font-normal text-xs transition-colors"
              title="Add Cookie"
            >
              + Add
            </button>
          </div>

          {#if domains.length === 0}
            <div class="p-3 text-center text-xs text-ink-faint">
              No cookies saved.
            </div>
          {:else}
            <button
              type="button"
              onclick={() => (selectedDomain = null)}
              class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-left transition-colors {selectedDomain === null
                ? 'bg-brand/15 text-brand'
                : 'text-ink hover:bg-hover'}"
            >
              <span class="truncate">All Domains</span>
              <span class="rounded bg-panel px-1.5 py-0.2 text-10 text-ink-faint font-mono">
                {cookies.length}
              </span>
            </button>

            {#each domains as dom}
              <button
                type="button"
                onclick={() => (selectedDomain = dom)}
                class="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-left transition-colors {selectedDomain === dom
                  ? 'bg-brand/15 text-brand'
                  : 'text-ink hover:bg-hover'}"
              >
                <span class="truncate font-mono">{dom}</span>
                <span class="rounded bg-panel px-1.5 py-0.2 text-10 text-ink-faint font-mono">
                  {domainCounts.get(dom) ?? 0}
                </span>
              </button>
            {/each}
          {/if}
        </div>

        <!-- Cookies Main Area -->
        <div class="flex flex-1 flex-col min-w-0 bg-panel overflow-hidden">
          <!-- Main top bar -->
          <div class="flex items-center justify-between border-b border-line px-4 py-2.5 bg-panel-2/30 gap-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-ink font-mono">
                {selectedDomain ? selectedDomain : "All Domains"}
              </span>
              <span class="text-xs text-ink-faint">
                ({displayedCookies.length} {displayedCookies.length === 1 ? "cookie" : "cookies"})
              </span>
            </div>

            <div class="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search cookies..."
                bind:value={filter}
                class="h-7 w-48 rounded border border-line bg-panel-2 px-2 text-xs text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onclick={startAddCookie}
                class="flex items-center gap-1 rounded border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink hover:bg-hover hover:border-line-strong transition-colors"
              >
                + Add Cookie
              </button>
              {#if selectedDomain}
                <button
                  type="button"
                  onclick={() => handleClearDomain(selectedDomain!)}
                  class="rounded border border-line px-2 py-1 text-xs font-medium text-ink-faint hover:text-rose-400 hover:border-rose-500/30 transition-colors"
                  title="Clear all cookies for {selectedDomain}"
                >
                  Clear Domain
                </button>
              {/if}
            </div>
          </div>

          <!-- Add Cookie drawer/form -->
          {#if addingCookie}
            <div class="border-b border-line bg-panel-2/40 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-semibold text-ink">Add Cookie</h3>
                <button
                  type="button"
                  onclick={() => (addingCookie = false)}
                  class="text-xs text-ink-faint hover:text-ink"
                >
                  Cancel
                </button>
              </div>
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label for="c-name" class="block font-medium text-ink-faint mb-1">Name</label>
                  <input
                    id="c-name"
                    type="text"
                    bind:value={newName}
                    placeholder="session_id"
                    class="w-full h-7 rounded border border-line bg-panel px-2 font-mono text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label for="c-val" class="block font-medium text-ink-faint mb-1">Value</label>
                  <input
                    id="c-val"
                    type="text"
                    bind:value={newValue}
                    placeholder="token_value"
                    class="w-full h-7 rounded border border-line bg-panel px-2 font-mono text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label for="c-dom" class="block font-medium text-ink-faint mb-1">Domain</label>
                  <input
                    id="c-dom"
                    type="text"
                    bind:value={newDomain}
                    placeholder="example.com"
                    class="w-full h-7 rounded border border-line bg-panel px-2 font-mono text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label for="c-path" class="block font-medium text-ink-faint mb-1">Path</label>
                  <input
                    id="c-path"
                    type="text"
                    bind:value={newPath}
                    placeholder="/"
                    class="w-full h-7 rounded border border-line bg-panel px-2 font-mono text-ink focus:border-brand focus:outline-none"
                  />
                </div>
              </div>

              <div class="flex items-center justify-between pt-1">
                <div class="flex items-center gap-4 text-xs text-ink">
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" bind:checked={newHttpOnly} class="size-3.5 accent-brand" />
                    <span>HttpOnly</span>
                  </label>
                  <label class="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" bind:checked={newSecure} class="size-3.5 accent-brand" />
                    <span>Secure</span>
                  </label>
                  <div class="flex items-center gap-1.5">
                    <span class="text-ink-faint">SameSite:</span>
                    <select
                      bind:value={newSameSite}
                      class="h-6 rounded border border-line bg-panel px-1 text-xs text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">Default</option>
                      <option value="Lax">Lax</option>
                      <option value="Strict">Strict</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onclick={handleSaveNew}
                  disabled={!newName.trim() || !newDomain.trim()}
                  class="rounded border border-line bg-panel-2 px-3 py-1 text-xs font-medium text-ink hover:bg-hover hover:border-line-strong disabled:opacity-40 transition-colors"
                >
                  Save Cookie
                </button>
              </div>
            </div>
          {/if}

          <!-- Cookie Table -->
          <div class="flex-1 overflow-y-auto">
            {#if displayedCookies.length === 0}
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <span class="text-2xl mb-1">🍪</span>
                <p class="text-xs font-medium text-ink">No cookies found</p>
                <p class="mt-0.5 text-xs text-ink-faint">
                  {cookies.length === 0
                    ? "Send a request that sets a cookie or click + Add Cookie above."
                    : "No cookies match your current filter."}
                </p>
              </div>
            {:else}
              <table class="w-full text-left text-xs">
                <thead class="sticky top-0 z-10 border-b border-line bg-panel-2 font-medium text-ink-muted">
                  <tr>
                    <th class="px-4 py-2">Name</th>
                    <th class="px-4 py-2">Value</th>
                    <th class="px-4 py-2">Domain</th>
                    <th class="px-4 py-2">Path</th>
                    <th class="px-4 py-2">Attributes</th>
                    <th class="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line bg-panel">
                  {#each displayedCookies as c (c.id)}
                    <tr class="hover:bg-hover/50 transition-colors group">
                      <td class="px-4 py-2 font-mono font-medium text-ink">
                        {c.name}
                      </td>
                      <td class="px-4 py-2 font-mono text-ink-muted max-w-xs truncate" title={c.value}>
                        <div class="flex items-center gap-1.5">
                          <span class="truncate">{c.value}</span>
                          <button
                            type="button"
                            onclick={() => navigator.clipboard.writeText(c.value)}
                            class="opacity-0 group-hover:opacity-100 text-10 text-ink-faint hover:text-ink px-1 rounded transition-opacity"
                            title="Copy value"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      <td class="px-4 py-2 font-mono text-ink-muted">{c.domain}</td>
                      <td class="px-4 py-2 font-mono text-ink-muted">{c.path}</td>
                      <td class="px-4 py-2 whitespace-nowrap">
                        <div class="inline-flex items-center gap-1">
                          {#if c.httpOnly}
                            <span class="rounded bg-amber-500/15 px-1.5 py-0.2 text-10 font-medium text-amber-400">
                              HttpOnly
                            </span>
                          {/if}
                          {#if c.secure}
                            <span class="rounded bg-emerald-500/15 px-1.5 py-0.2 text-10 font-medium text-emerald-400">
                              Secure
                            </span>
                          {/if}
                          {#if c.sameSite}
                            <span class="rounded bg-sky-500/15 px-1.5 py-0.2 text-10 font-medium text-sky-400">
                              {c.sameSite}
                            </span>
                          {/if}
                        </div>
                      </td>
                      <td class="px-4 py-2 text-right">
                        <button
                          type="button"
                          onclick={() => handleDelete(c.id)}
                          class="rounded p-1 text-ink-faint hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete cookie"
                        >
                          <Icon name="trash" class="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
