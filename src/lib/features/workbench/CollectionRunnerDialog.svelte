<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import { focusTrap } from "#lib/utils/focusTrap";
  import { humanMs } from "#lib/utils/format";
  import {
    runnerState,
    closeRunner,
    startRunner,
    cancelRunner,
    toggleRunnerItem,
    toggleAllRunnerItems,
    moveRunnerItem,
    getRunnerSummary,
    exportRunnerReport,
    methodColor,
    statusTone,
    wb,
    composePath,
  } from "./state.svelte";

  let viewMode = $state<"config" | "results">("config");
  let expandedStep = $state<number | null>(null);

  // Automatically switch to results view once runner starts
  $effect(() => {
    if (runnerState.running) {
      viewMode = "results";
    }
  });

  const enabledItems = $derived(runnerState.items.filter((i) => i.enabled));
  const totalStepsExpected = $derived(enabledItems.length * runnerState.config.iterations);
  const summary = $derived(getRunnerSummary());
  const progressPercent = $derived(
    totalStepsExpected > 0 ? Math.min(100, Math.round((runnerState.results.length / totalStepsExpected) * 100)) : 0,
  );

  function toggleAccordion(stepIndex: number) {
    expandedStep = expandedStep === stepIndex ? null : stepIndex;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && runnerState.open && !runnerState.running) {
      closeRunner();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if runnerState.open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget && !runnerState.running) closeRunner();
    }}
  >
    <div
      use:focusTrap
      role="dialog"
      aria-modal="true"
      aria-label="Collection Runner"
      class="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
    >
      <!-- Dialog Header -->
      <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div class="flex items-center gap-3">
          <span class="grid size-8 place-items-center rounded-lg border border-line bg-panel-2 text-ink-muted">
            <Icon name={runnerState.isCollection ? "layers" : "folder"} size={16} />
          </span>
          <div>
            <h2 class="text-sm font-semibold text-ink">
              Runner — {runnerState.containerName}
            </h2>
            <p class="text-11 text-ink-faint">
              Automated multi-request execution & test suite
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <!-- View switcher when results exist -->
          {#if runnerState.results.length > 0 || runnerState.running}
            <div class="flex items-center rounded-lg border border-line bg-panel-2/60 p-0.5 text-xs font-medium">
              <button
                type="button"
                onclick={() => (viewMode = "config")}
                disabled={runnerState.running}
                class="rounded-md px-2.5 py-1 transition-colors disabled:opacity-40"
                class:bg-panel={viewMode === "config"}
                class:text-ink={viewMode === "config"}
                class:text-ink-muted={viewMode !== "config"}
              >
                Configure
              </button>
              <button
                type="button"
                onclick={() => (viewMode = "results")}
                class="rounded-md px-2.5 py-1 transition-colors"
                class:bg-panel={viewMode === "results"}
                class:text-ink={viewMode === "results"}
                class:text-ink-muted={viewMode !== "results"}
              >
                Results ({runnerState.results.length})
              </button>
            </div>
          {/if}

          <button
            type="button"
            onclick={closeRunner}
            disabled={runnerState.running}
            class="grid size-7 place-items-center rounded text-ink-faint transition-colors hover:bg-panel-2 hover:text-ink disabled:opacity-40"
            aria-label="Close runner"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      <!-- Dialog Body -->
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {#if viewMode === "config"}
          <!-- CONFIGURATION VIEW -->
          <div class="space-y-5 p-5">
            <!-- Settings Bar -->
            <div class="grid grid-cols-1 gap-4 rounded-xl border border-line bg-panel-2/30 p-4 sm:grid-cols-3">
              <!-- Environment picker -->
              <div>
                <label for="runner-env" class="block text-xs font-medium text-ink-muted">Environment</label>
                <select
                  id="runner-env"
                  bind:value={runnerState.config.envId}
                  class="mt-1.5 h-8 w-full rounded-md border border-line bg-panel px-2.5 text-xs text-ink focus:border-brand focus:outline-none"
                >
                  <option value={null}>No environment</option>
                  {#each wb.environments as env (env.id)}
                    <option value={env.id}>{env.name}</option>
                  {/each}
                </select>
              </div>

              <!-- Iterations -->
              <div>
                <label for="runner-iterations" class="block text-xs font-medium text-ink-muted">Iterations</label>
                <input
                  id="runner-iterations"
                  type="number"
                  min="1"
                  max="100"
                  bind:value={runnerState.config.iterations}
                  class="mt-1.5 h-8 w-full rounded-md border border-line bg-panel px-2.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <!-- Delay (ms) -->
              <div>
                <label for="runner-delay" class="block text-xs font-medium text-ink-muted">Delay between calls (ms)</label>
                <input
                  id="runner-delay"
                  type="number"
                  min="0"
                  step="50"
                  placeholder="0"
                  bind:value={runnerState.config.delayMs}
                  class="mt-1.5 h-8 w-full rounded-md border border-line bg-panel px-2.5 font-mono text-xs text-ink focus:border-brand focus:outline-none"
                />
              </div>

              <!-- Toggles -->
              <div class="col-span-full flex flex-wrap items-center gap-6 pt-1 text-xs">
                <label class="flex items-center gap-2 cursor-pointer text-ink">
                  <input
                    type="checkbox"
                    bind:checked={runnerState.config.stopOnFailure}
                    class="size-3.5 accent-brand cursor-pointer"
                  />
                  <span>Stop run on first failed test or error</span>
                </label>

                <label class="flex items-center gap-2 cursor-pointer text-ink">
                  <input
                    type="checkbox"
                    bind:checked={runnerState.config.persistVariables}
                    class="size-3.5 accent-brand cursor-pointer"
                  />
                  <span>Persist variables updated by <code>rio.setEnv()</code></span>
                </label>
              </div>
            </div>

            <!-- Queue Selection -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    Execution Queue
                  </h3>
                  <span class="rounded-full bg-panel-2 px-2 py-0.5 text-10 font-medium tabular-nums text-ink-muted">
                    {enabledItems.length} of {runnerState.items.length} selected
                  </span>
                </div>

                <div class="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onclick={() => toggleAllRunnerItems(true)}
                    class="rounded px-2 py-1 text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    Select all
                  </button>
                  <span class="text-ink-faint">·</span>
                  <button
                    type="button"
                    onclick={() => toggleAllRunnerItems(false)}
                    class="rounded px-2 py-1 text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              <!-- Reorderable List of Requests -->
              <div class="overflow-hidden rounded-lg border border-line bg-panel">
                {#if runnerState.items.length === 0}
                  <div class="p-8 text-center text-xs text-ink-faint">
                    No requests found in this container.
                  </div>
                {:else}
                  <div class="divide-y divide-line/60">
                    {#each runnerState.items as item, index (item.id)}
                      <div
                        class="flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-panel-2/40 {item.enabled ? '' : 'opacity-50'}"
                      >
                        <!-- Order buttons -->
                        <div class="flex items-center gap-0.5 text-ink-faint">
                          <button
                            type="button"
                            disabled={index === 0}
                            onclick={() => moveRunnerItem(index, index - 1)}
                            class="grid size-5 place-items-center rounded hover:bg-panel hover:text-ink disabled:opacity-20"
                            title="Move up"
                          >
                            <span class="text-10">▲</span>
                          </button>
                          <button
                            type="button"
                            disabled={index === runnerState.items.length - 1}
                            onclick={() => moveRunnerItem(index, index + 1)}
                            class="grid size-5 place-items-center rounded hover:bg-panel hover:text-ink disabled:opacity-20"
                            title="Move down"
                          >
                            <span class="text-10">▼</span>
                          </button>
                        </div>

                        <!-- Checkbox -->
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onchange={() => toggleRunnerItem(item.id)}
                          aria-label="Toggle request"
                          class="size-3.5 accent-brand cursor-pointer"
                        />

                        <!-- Method badge -->
                        <span class="w-14 font-mono text-xs font-bold {methodColor(item.request.method)}">
                          {item.request.method}
                        </span>

                        <!-- Name and URL -->
                        <div class="min-w-0 flex-1 truncate">
                          <span class="text-xs font-medium text-ink">{item.request.name || "Untitled Request"}</span>
                          <span class="ml-2 font-mono text-11 text-ink-faint break-all">
                            {composePath(item.request.url, item.location)}
                          </span>
                        </div>

                        <!-- Script indicators -->
                        <div class="flex items-center gap-1.5 shrink-0 text-10">
                          {#if item.request.preRequestScript?.trim()}
                            <span
                              class="rounded bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-400"
                              title="Pre-request script configured"
                            >
                              pre
                            </span>
                          {/if}
                          {#if item.request.testScript?.trim()}
                            <span
                              class="rounded bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400"
                              title="Test script configured"
                            >
                              test
                            </span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else}
          <!-- RESULTS VIEW -->
          <div class="space-y-4 p-5">
            <!-- Progress Bar -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs font-medium">
                <div class="flex items-center gap-2">
                  {#if runnerState.running}
                    <span class="size-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand"></span>
                    <span class="text-brand">Running ({runnerState.results.length}/{totalStepsExpected})</span>
                  {:else if runnerState.cancelled}
                    <span class="flex items-center gap-1 text-warn">
                      <Icon name="alert-triangle" size={13} />
                      Run cancelled
                    </span>
                  {:else if summary.failedTests > 0}
                    <span class="flex items-center gap-1 text-rose-400">
                      <Icon name="x" size={13} />
                      Completed with failures
                    </span>
                  {:else}
                    <span class="flex items-center gap-1 text-emerald-400">
                      <Icon name="check" size={13} />
                      Completed successfully
                    </span>
                  {/if}
                </div>
                <span class="font-mono text-ink-muted">{progressPercent}%</span>
              </div>

              <div class="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  class="h-full rounded-full transition-all duration-200 {summary.failedTests > 0 ? 'bg-rose-500' : 'bg-brand'}"
                  style="width: {progressPercent}%"
                ></div>
              </div>
            </div>

            <!-- KPI Metric Cards -->
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <!-- Requests Card -->
              <div class="rounded-lg border border-line bg-panel-2/40 p-3">
                <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">Requests Run</span>
                <p class="mt-1 font-mono text-base font-bold text-ink">
                  {summary.completedRequests} <span class="text-xs font-normal text-ink-muted">/ {totalStepsExpected}</span>
                </p>
              </div>

              <!-- Tests Card -->
              <div class="rounded-lg border border-line bg-panel-2/40 p-3">
                <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">Tests Result</span>
                <p class="mt-1 font-mono text-base font-bold">
                  <span class="text-emerald-400">{summary.passedTests} passed</span>
                  {#if summary.failedTests > 0}
                    <span class="text-rose-400 text-xs font-normal ml-1">/ {summary.failedTests} failed</span>
                  {/if}
                </p>
              </div>

              <!-- Total Duration Card -->
              <div class="rounded-lg border border-line bg-panel-2/40 p-3">
                <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">Total Duration</span>
                <p class="mt-1 font-mono text-base font-bold text-ink">
                  {humanMs(summary.totalDurationMs)}
                </p>
              </div>

              <!-- Avg Latency Card -->
              <div class="rounded-lg border border-line bg-panel-2/40 p-3">
                <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">Avg Latency</span>
                <p class="mt-1 font-mono text-base font-bold text-ink">
                  {summary.avgTimeMs} <span class="text-xs font-normal text-ink-muted">ms</span>
                </p>
              </div>
            </div>

            <!-- Execution Steps Feed -->
            <div class="space-y-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Run Steps ({runnerState.results.length})
              </h3>

              <div class="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-panel">
                {#if runnerState.results.length === 0}
                  <div class="p-8 text-center text-xs text-ink-faint">
                    No results yet. Click "Start Run" to begin testing.
                  </div>
                {:else}
                  {#each runnerState.results as step (step.stepIndex)}
                    {@const isExpanded = expandedStep === step.stepIndex}
                    <div class="transition-colors hover:bg-panel-2/30">
                      <button
                        type="button"
                        onclick={() => toggleAccordion(step.stepIndex)}
                        class="flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-xs transition-colors"
                      >
                        <!-- Status Icon -->
                        <span
                          class="grid size-5 shrink-0 place-items-center rounded-full text-10 font-bold {step.passed
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'}"
                        >
                          <Icon name={step.passed ? "check" : "x"} size={11} />
                        </span>

                        <!-- Step index / Iteration -->
                        <span class="font-mono text-11 text-ink-faint">
                          #{step.stepIndex}
                          {#if runnerState.config.iterations > 1}
                            <span class="text-10 text-ink-muted">(Iter {step.iteration})</span>
                          {/if}
                        </span>

                        <!-- Method -->
                        <span class="w-14 font-mono font-bold {methodColor(step.method)}">
                          {step.method}
                        </span>

                        <!-- Request name and URL -->
                        <div class="min-w-0 flex-1 truncate">
                          <span class="font-medium text-ink">{step.requestName}</span>
                          <span class="ml-2 font-mono text-11 text-ink-faint break-all">{step.url}</span>
                        </div>

                        <!-- Status badge -->
                        {#if step.status}
                          <span class="font-mono font-semibold {statusTone(step.status)}">
                            {step.status} {step.statusText}
                          </span>
                        {:else if step.error}
                          <span class="font-mono font-semibold text-danger">Error</span>
                        {/if}

                        <!-- Latency -->
                        {#if step.timeMs != null}
                          <span class="font-mono text-11 tabular-nums text-ink-muted">
                            {step.timeMs} ms
                          </span>
                        {/if}

                        <!-- Tests badge -->
                        {#if step.testResults.length > 0}
                          {@const passedTests = step.testResults.filter((t) => t.passed).length}
                          {@const totalTests = step.testResults.length}
                          <span
                            class="rounded-full px-2 py-0.5 text-10 font-semibold tabular-nums {passedTests === totalTests
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-rose-500/15 text-rose-400'}"
                          >
                            {passedTests}/{totalTests} tests
                          </span>
                        {/if}

                        <!-- Accordion chevron -->
                        <Icon
                          name="chevron-right"
                          size={13}
                          class="shrink-0 text-ink-faint transition-transform duration-150 {isExpanded ? 'rotate-90' : ''}"
                        />
                      </button>

                      <!-- Expanded Details Drawer -->
                      {#if isExpanded}
                        <div class="space-y-2.5 border-t border-line/40 bg-black/20 p-3.5 text-xs">
                          <!-- Error message if any -->
                          {#if step.error}
                            <div class="rounded-md border border-danger/30 bg-danger/10 p-2.5 font-mono text-xs text-danger">
                              {step.error}
                            </div>
                          {/if}

                          <!-- Test assertions -->
                          {#if step.testResults.length > 0}
                            <div class="space-y-1.5">
                              <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">
                                Test Assertions ({step.testResults.length})
                              </span>
                              {#each step.testResults as t}
                                <div class="flex items-start gap-2">
                                  {#if t.passed}
                                    <Icon name="check" size={13} class="mt-0.5 shrink-0 text-emerald-400" />
                                  {:else}
                                    <Icon name="x" size={13} class="mt-0.5 shrink-0 text-rose-400" />
                                  {/if}
                                  <div class="min-w-0 flex-1">
                                    <span class="{t.passed ? 'text-ink' : 'text-rose-300 font-medium'}">
                                      {t.name}
                                    </span>
                                    {#if !t.passed && t.error}
                                      <pre class="mt-1 rounded border border-rose-500/30 bg-black/40 p-2 font-mono text-11 text-rose-300 whitespace-pre-wrap break-all">{t.error}</pre>
                                    {/if}
                                  </div>
                                </div>
                              {/each}
                            </div>
                          {/if}

                          <!-- Console logs -->
                          {#if step.logs.length > 0}
                            <div class="space-y-1">
                              <span class="text-10 font-semibold uppercase tracking-wide text-ink-faint">Console Logs</span>
                              <div class="rounded border border-line bg-black/50 p-2 font-mono text-11 text-ink-muted">
                                {#each step.logs as log}
                                  <div>&gt; {log}</div>
                                {/each}
                              </div>
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Dialog Footer -->
      <div class="flex items-center justify-between border-t border-line bg-panel-2/50 px-5 py-3">
        {#if viewMode === "config"}
          <span class="text-xs text-ink-faint">
            {enabledItems.length} {enabledItems.length === 1 ? "request" : "requests"} queued
          </span>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={closeRunner}
              class="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
            >
              Close
            </button>
            <button
              type="button"
              onclick={startRunner}
              disabled={enabledItems.length === 0}
              class="flex items-center gap-2 rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-brand/20 transition-all hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="send" size={14} />
              Start Run
            </button>
          </div>
        {:else}
          <div class="flex items-center gap-2">
            {#if !runnerState.running && runnerState.results.length > 0}
              <button
                type="button"
                onclick={exportRunnerReport}
                class="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
              >
                <Icon name="download" size={13} />
                Export Report
              </button>
            {/if}
          </div>

          <div class="flex items-center gap-2">
            {#if runnerState.running}
              <button
                type="button"
                onclick={cancelRunner}
                class="flex items-center gap-1.5 rounded-lg border border-danger/50 bg-danger/10 px-4 py-1.5 text-xs font-semibold text-danger transition-colors hover:bg-danger/20 active:scale-95"
              >
                Cancel Run
              </button>
            {:else}
              <button
                type="button"
                onclick={() => (viewMode = "config")}
                class="rounded-lg border border-line px-3.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
              >
                Configure
              </button>
              <button
                type="button"
                onclick={startRunner}
                class="flex items-center gap-2 rounded-lg bg-brand px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-brand/20 transition-all hover:bg-brand-strong active:scale-95"
              >
                <Icon name="send" size={14} />
                Run Again
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
