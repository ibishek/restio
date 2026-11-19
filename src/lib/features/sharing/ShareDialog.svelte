<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import type { GitStatus, ResolveStrategy } from "#lib/types";
  import { focusTrap } from "#lib/utils/focusTrap";
  import {
    sharingStatus,
    sharingDefaultDir,
    sharingInit,
    sharingClone,
    sharingSetRemote,
    sharingPublish,
    sharingPull,
    sharingResolvePull,
    pickDirectory,
  } from "#lib/ipc";

  let { open = $bindable(false), onSynced }: { open?: boolean; onSynced?: () => void } = $props();

  let status = $state<GitStatus | null>(null);
  let busy = $state(false);
  let error = $state("");
  let notice = $state("");
  // Set when a pull can't fast-forward — the user picks a file-level resolution.
  let diverged = $state(false);

  // Setup inputs (shown when collections aren't in a repo yet).
  let initDir = $state("");
  let cloneUrl = $state("");
  let cloneDir = $state("");
  // Repo inputs.
  let remoteUrl = $state("");
  let commitMessage = $state("");

  let didLoad = false;
  $effect(() => {
    if (open && !didLoad) {
      didLoad = true;
      void refresh(true);
    }
    if (!open) didLoad = false;
  });

  async function refresh(prefill = false) {
    error = "";
    diverged = false;
    try {
      status = await sharingStatus();
      if (prefill) {
        const def = await sharingDefaultDir();
        if (!initDir) initDir = def;
        if (!cloneDir) cloneDir = def;
      }
    } catch (e) {
      error = msg(e);
    }
  }

  function msg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  async function run(action: () => Promise<GitStatus>, ok: string, sync = false) {
    if (busy) return;
    busy = true;
    error = "";
    notice = "";
    try {
      status = await action();
      notice = ok;
      if (sync) onSynced?.();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  // Pull is special: it can come back "diverged", which isn't an error but a
  // fork the user must resolve at the file level.
  async function doPull() {
    if (busy) return;
    busy = true;
    error = "";
    notice = "";
    diverged = false;
    try {
      const res = await sharingPull();
      status = res.status;
      if (res.outcome === "diverged") {
        diverged = true;
      } else if (res.outcome === "fastForwarded") {
        notice = "Pulled latest.";
        onSynced?.();
      } else {
        notice = "Already up to date.";
      }
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  async function resolve(strategy: ResolveStrategy) {
    if (busy) return;
    busy = true;
    error = "";
    notice = "";
    try {
      status = await sharingResolvePull(strategy);
      diverged = false;
      notice =
        strategy === "remote"
          ? "Replaced with the remote version."
          : "Kept your version — publish to push it.";
      onSynced?.();
    } catch (e) {
      error = msg(e);
    } finally {
      busy = false;
    }
  }

  const close = () => {
    open = false;
    diverged = false;
  };
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  // Native folder pickers for the repo paths. No-op outside the Tauri shell.
  async function browseInit() {
    try {
      const dir = await pickDirectory(initDir);
      if (dir) initDir = dir;
    } catch {
      /* no native dialog outside Tauri */
    }
  }
  async function browseClone() {
    try {
      const dir = await pickDirectory(cloneDir);
      if (dir) cloneDir = dir;
    } catch {
      /* no native dialog outside Tauri */
    }
  }

  function relTime(at: number): string {
    if (!at) return "";
    const secs = Math.max(0, Math.round(Date.now() / 1000 - at));
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(at * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
      aria-labelledby="share-title"
      class="flex max-h-modal w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/50"
    >
      <!-- Header -->
      <div class="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Icon name="git-branch" size={16} class="text-brand" />
        <span id="share-title" class="text-sm font-semibold">Share collections</span>
        <button
          onclick={close}
          aria-label="Close"
          class="ml-auto grid size-7 place-items-center rounded-md text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p class="text-xs text-ink-faint">
          Collections sync over Git. Only requests are shared — environment values stay on your
          device and never enter the repo.
        </p>

        {#if error}
          <div class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        {/if}
        {#if notice}
          <div class="flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-xs text-brand">
            <Icon name="check" size={13} />
            {notice}
          </div>
        {/if}

        {#if status && status.isRepo}
          <!-- ── Connected repo ─────────────────────────────────────────── -->
          <div class="space-y-2 rounded-lg border border-line bg-panel-2/40 p-3 text-13">
            <div class="flex items-center gap-2">
              <Icon name="git-branch" size={14} class="text-ink-muted" />
              <span class="font-mono font-medium text-ink">{status.branch || "—"}</span>
              {#if status.dirty}
                <span class="rounded-full bg-warn/15 px-1.5 py-0.5 text-10 font-medium text-warn">
                  uncommitted changes
                </span>
              {/if}
              <span class="ml-auto flex items-center gap-2 text-11 tabular-nums text-ink-faint">
                {#if status.ahead > 0}<span title="ahead of remote">↑{status.ahead}</span>{/if}
                {#if status.behind > 0}<span title="behind remote">↓{status.behind}</span>{/if}
              </span>
            </div>
            <div class="truncate text-11 text-ink-faint" title={status.remoteUrl}>
              {status.hasRemote ? status.remoteUrl : "No remote configured"}
            </div>
            {#if status.lastCommit}
              <div class="truncate text-11 text-ink-faint">
                Last: {status.lastCommit}
                <span class="text-ink-faint/70">· {relTime(status.lastCommitAt)}</span>
              </div>
            {/if}
          </div>

          {#if !status.hasRemote}
            <div class="space-y-1.5">
              <label for="remote-url" class="text-xs font-medium text-ink-muted">Add a remote</label>
              <div class="flex gap-2">
                <input
                  id="remote-url"
                  bind:value={remoteUrl}
                  placeholder="git@github.com:team/collections.git"
                  spellcheck="false"
                  class="h-9 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
                />
                <button
                  onclick={() => run(() => sharingSetRemote(remoteUrl), "Remote set.")}
                  disabled={busy || !remoteUrl.trim()}
                  class="h-9 shrink-0 rounded-md border border-line px-3 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-40"
                >
                  Set
                </button>
              </div>
            </div>
          {/if}

          <div class="space-y-1.5">
            <label for="commit-msg" class="text-xs font-medium text-ink-muted">
              Publish (commit{status.hasRemote ? " + push" : ""})
            </label>
            <input
              id="commit-msg"
              bind:value={commitMessage}
              placeholder="Update collections"
              class="h-9 w-full rounded-md border border-line bg-panel-2 px-2.5 text-13 text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
            />
          </div>

          <div class="flex gap-2">
            <button
              onclick={() => run(() => sharingPublish(commitMessage), "Published.")}
              disabled={busy}
              class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              <Icon name="upload" size={15} />
              Publish
            </button>
            <button
              onclick={doPull}
              disabled={busy || !status.hasRemote}
              class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-40"
            >
              <Icon name="download" size={15} />
              Pull
            </button>
          </div>

          {#if diverged}
            <!-- Local and remote both advanced: a line-level merge would corrupt
                 the single JSON file, so resolve at the file level. -->
            <div class="space-y-2 rounded-lg border border-warn/40 bg-warn/10 p-3">
              <h3 class="flex items-center gap-1.5 text-xs font-semibold text-warn">
                <Icon name="alert-triangle" size={13} />
                Local and remote have both changed
              </h3>
              <p class="text-11 text-ink-muted">
                A clean pull isn't possible. Collections are a single file, so pick which version to
                keep: <span class="font-medium text-ink">Use remote</span> discards your local changes;
                <span class="font-medium text-ink">Keep mine</span> overwrites the remote on your next
                publish.
              </p>
              <div class="flex gap-2">
                <button
                  onclick={() => resolve("remote")}
                  disabled={busy}
                  class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-40"
                >
                  <Icon name="download" size={14} />
                  Use remote
                </button>
                <button
                  onclick={() => resolve("local")}
                  disabled={busy}
                  class="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-line bg-panel px-3 text-xs font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-40"
                >
                  <Icon name="upload" size={14} />
                  Keep mine
                </button>
              </div>
              <button
                onclick={() => (diverged = false)}
                class="text-11 font-medium text-ink-faint transition-colors hover:text-ink"
              >
                Cancel
              </button>
            </div>
          {/if}

          <p class="truncate text-11 text-ink-faint" title={status.path}>{status.path}</p>
        {:else if status}
          <!-- ── Not a repo yet: init or clone ──────────────────────────── -->
          <div class="space-y-2 rounded-lg border border-line p-3">
            <h3 class="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Icon name="git-branch" size={13} class="text-ink-muted" />
              Start sharing
            </h3>
            <p class="text-11 text-ink-faint">
              Create a new Git repo from your current collections, then add a remote to push.
            </p>
            <div class="flex gap-2">
              <input
                bind:value={initDir}
                placeholder="/path/to/collections-repo"
                spellcheck="false"
                aria-label="New repository folder"
                class="h-9 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
              />
              <button
                onclick={browseInit}
                type="button"
                aria-label="Browse for folder"
                title="Browse…"
                class="grid size-9 shrink-0 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <Icon name="folder" size={15} />
              </button>
            </div>
            <button
              onclick={() => run(() => sharingInit(initDir), "Repository created.", true)}
              disabled={busy || !initDir.trim()}
              class="h-9 w-full rounded-md bg-brand text-sm font-semibold text-slate-950 transition-colors hover:bg-brand-strong disabled:opacity-50"
            >
              Initialize repository
            </button>
          </div>

          <div class="space-y-2 rounded-lg border border-line p-3">
            <h3 class="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Icon name="download" size={13} class="text-ink-muted" />
              Join a shared repo
            </h3>
            <p class="text-11 text-ink-faint">
              Clone a team repo; its collections replace what's shown here.
            </p>
            <input
              bind:value={cloneUrl}
              placeholder="git@github.com:team/collections.git"
              spellcheck="false"
              aria-label="Remote URL to clone"
              class="h-9 w-full rounded-md border border-line bg-panel-2 px-2.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
            />
            <div class="flex gap-2">
              <input
                bind:value={cloneDir}
                placeholder="/path/to/clone-into"
                spellcheck="false"
                aria-label="Local folder to clone into"
                class="h-9 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
              />
              <button
                onclick={browseClone}
                type="button"
                aria-label="Browse for folder"
                title="Browse…"
                class="grid size-9 shrink-0 place-items-center rounded-md border border-line text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                <Icon name="folder" size={15} />
              </button>
            </div>
            <button
              onclick={() => run(() => sharingClone(cloneUrl, cloneDir), "Cloned.", true)}
              disabled={busy || !cloneUrl.trim() || !cloneDir.trim()}
              class="h-9 w-full rounded-md border border-line text-sm font-medium text-ink transition-colors hover:border-line-strong disabled:opacity-40"
            >
              Clone repository
            </button>
          </div>
        {:else}
          <p class="py-8 text-center text-sm text-ink-faint">Loading…</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
