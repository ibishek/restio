// Collection / Folder multi-request automated test runner.

import { sendRequest } from "#lib/ipc";
import type {
  Collection,
  Environment,
  Folder,
  HttpRequest,
  RunnerItem,
  RunnerRunConfig,
  RunnerStepResult,
  RunnerSummary,
  TestResult,
} from "#lib/types";
import { resolveRequest } from "#lib/utils/interpolate";
import { runScript } from "#lib/utils/scriptRunner";
import { composePath, containerAt, effectiveAuth } from "./collections.svelte";
import { activeEnvironment, applyEnvUpdates } from "./environments.svelte";
import { toast } from "#lib/components/ui/toasts.svelte";
import { uid, type RequestLocation } from "./types";
import { wb } from "./workbench.svelte";

interface RunnerState {
  open: boolean;
  containerLoc: RequestLocation | null;
  containerName: string;
  isCollection: boolean;
  items: RunnerItem[];
  config: RunnerRunConfig;
  running: boolean;
  cancelled: boolean;
  currentStepIndex: number;
  currentIteration: number;
  results: RunnerStepResult[];
  startTime: number | null;
  endTime: number | null;
}

export const runnerState = $state<RunnerState>({
  open: false,
  containerLoc: null,
  containerName: "",
  isCollection: true,
  items: [],
  config: {
    iterations: 1,
    delayMs: 0,
    stopOnFailure: false,
    persistVariables: true,
    envId: null,
  },
  running: false,
  cancelled: false,
  currentStepIndex: 0,
  currentIteration: 1,
  results: [],
  startTime: null,
  endTime: null,
});

/** Flatten requests in a collection or folder in depth-first order. */
function collectRequests(
  node: Collection | Folder,
  currentLoc: RequestLocation,
  acc: RunnerItem[],
): void {
  for (const req of node.requests) {
    acc.push({
      id: uid(),
      request: structuredClone($state.snapshot(req)),
      location: currentLoc,
      enabled: !req.deprecated,
    });
  }
  for (const folder of node.folders) {
    const nextLoc: RequestLocation = {
      collectionId: currentLoc.collectionId,
      folderIds: [...currentLoc.folderIds, folder.id],
    };
    collectRequests(folder, nextLoc, acc);
  }
}

/** Open the Collection Runner dialog targeted at a collection or folder. */
export function openRunner(loc: RequestLocation): void {
  const container = containerAt(loc);
  if (!container) return;

  const items: RunnerItem[] = [];
  collectRequests(container, loc, items);

  const isCollection = loc.folderIds.length === 0;

  runnerState.open = true;
  runnerState.containerLoc = loc;
  runnerState.containerName = container.name || (isCollection ? "Collection" : "Folder");
  runnerState.isCollection = isCollection;
  runnerState.items = items;
  runnerState.config = {
    iterations: 1,
    delayMs: 0,
    stopOnFailure: false,
    persistVariables: true,
    envId: wb.activeEnvId,
  };
  runnerState.running = false;
  runnerState.cancelled = false;
  runnerState.currentStepIndex = 0;
  runnerState.currentIteration = 1;
  runnerState.results = [];
  runnerState.startTime = null;
  runnerState.endTime = null;
}

export function closeRunner(): void {
  if (runnerState.running) {
    cancelRunner();
  }
  runnerState.open = false;
}

export function toggleRunnerItem(id: string): void {
  const item = runnerState.items.find((i) => i.id === id);
  if (item) item.enabled = !item.enabled;
}

export function toggleAllRunnerItems(enabled: boolean): void {
  for (const item of runnerState.items) {
    item.enabled = enabled;
  }
}

export function moveRunnerItem(fromIndex: number, toIndex: number): void {
  if (fromIndex < 0 || fromIndex >= runnerState.items.length) return;
  if (toIndex < 0 || toIndex >= runnerState.items.length) return;
  const [removed] = runnerState.items.splice(fromIndex, 1);
  if (removed) {
    runnerState.items.splice(toIndex, 0, removed);
  }
}

export function cancelRunner(): void {
  if (!runnerState.running) return;
  runnerState.cancelled = true;
  runnerState.running = false;
  runnerState.endTime = Date.now();
  toast.info("Runner cancelled", "Execution stopped by user");
}

async function executeRunnerStep(
  item: RunnerItem,
  iteration: number,
  stepIndex: number,
  currentEnvMap: Record<string, string>,
  config: RunnerRunConfig,
): Promise<RunnerStepResult> {
  const runId = uid();
  const req = structuredClone(item.request);
  const loc = item.location;
  const logs: string[] = [];
  let testResults: TestResult[] = [];
  let error: string | undefined;
  let status: number | undefined;
  let statusText: string | undefined;
  let timeMs: number | undefined;
  let sizeBytes: number | undefined;

  // 1. Pre-request script execution
  if (req.preRequestScript && req.preRequestScript.trim()) {
    try {
      const preOut = await runScript(req.preRequestScript, {
        environment: currentEnvMap,
        request: {
          url: req.url,
          method: req.method,
          headers: req.headers,
          body: req.body,
        },
      });
      if (preOut.logs.length) logs.push(...preOut.logs);
      if (Object.keys(preOut.environmentUpdates).length > 0) {
        Object.assign(currentEnvMap, preOut.environmentUpdates);
        if (config.persistVariables) {
          applyEnvUpdates(preOut.environmentUpdates);
        }
      }
      if (preOut.requestUpdates?.body !== undefined) {
        req.body = preOut.requestUpdates.body;
        if (req.bodyMode === "none") {
          req.bodyMode = "json";
        }
      }
      if (preOut.requestUpdates?.url !== undefined) {
        req.url = preOut.requestUpdates.url;
      }
      if (preOut.error) {
        logs.push(`[Pre-request error] ${preOut.error}`);
      }
    } catch (err) {
      logs.push(`[Pre-request error] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Synthesize environment from live running env map
  const syntheticEnv: Environment = {
    id: "runner-env",
    name: "Runner Environment",
    variables: Object.entries(currentEnvMap).map(([k, v]) => ({
      id: k,
      key: k,
      value: v,
      enabled: true,
    })),
  };

  const composed = structuredClone(req) as HttpRequest;
  composed.url = composePath(composed.url, loc, syntheticEnv);
  composed.auth = effectiveAuth(loc, composed.auth);

  const toSend = structuredClone(composed) as HttpRequest;
  if (toSend.params.some((p) => p.enabled && p.key.trim() !== "")) {
    const qi = toSend.url.indexOf("?");
    if (qi !== -1) {
      toSend.url = toSend.url.slice(0, qi);
    }
  }

  const resolved = resolveRequest(toSend, syntheticEnv);

  // 3. Dispatch native HTTP request through Rust
  try {
    const resp = await sendRequest(runId, resolved);
    status = resp.status;
    statusText = resp.statusText;
    timeMs = resp.timeMs;
    sizeBytes = resp.sizeBytes;

    // 4. Post-response / Tests script execution
    if (req.testScript && req.testScript.trim()) {
      try {
        const testOut = await runScript(req.testScript, {
          environment: currentEnvMap,
          request: {
            url: resolved.url,
            method: resolved.method,
            headers: resolved.headers,
            body: resolved.body,
          },
          response: resp,
        });
        testResults = testOut.testResults;
        if (testOut.logs.length) logs.push(...testOut.logs);
        if (Object.keys(testOut.environmentUpdates).length > 0) {
          Object.assign(currentEnvMap, testOut.environmentUpdates);
          if (config.persistVariables) {
            applyEnvUpdates(testOut.environmentUpdates);
          }
        }
        if (testOut.error) {
          logs.push(`[Test error] ${testOut.error}`);
        }
      } catch (scriptErr) {
        logs.push(
          `[Test error] ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}`,
        );
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const passed =
    !error &&
    (testResults.length > 0
      ? testResults.every((t) => t.passed)
      : status !== undefined && status < 400);

  return {
    stepIndex,
    iteration,
    requestId: req.id,
    requestName: req.name || req.url,
    method: req.method,
    url: resolved.url,
    status,
    statusText,
    timeMs,
    sizeBytes,
    testResults,
    logs,
    error,
    passed,
  };
}

/** Launch the execution of the selected requests across all configured iterations. */
export async function startRunner(): Promise<void> {
  const enabledItems = runnerState.items.filter((i) => i.enabled);
  if (runnerState.running || enabledItems.length === 0) return;

  runnerState.running = true;
  runnerState.cancelled = false;
  runnerState.results = [];
  runnerState.startTime = Date.now();
  runnerState.endTime = null;

  // Build the initial variable environment
  const targetEnv = runnerState.config.envId
    ? (wb.environments.find((e) => e.id === runnerState.config.envId) ?? activeEnvironment())
    : activeEnvironment();

  const currentEnvMap: Record<string, string> = {};
  if (targetEnv) {
    for (const v of targetEnv.variables) {
      if (v.enabled && v.key) {
        currentEnvMap[v.key] = v.value;
      }
    }
  }

  let stepCounter = 0;

  for (let iter = 1; iter <= runnerState.config.iterations; iter++) {
    if (runnerState.cancelled) break;
    runnerState.currentIteration = iter;

    for (let i = 0; i < enabledItems.length; i++) {
      if (runnerState.cancelled) break;
      runnerState.currentStepIndex = i;
      const item = enabledItems[i];

      if (runnerState.config.delayMs > 0 && (iter > 1 || i > 0)) {
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, runnerState.config.delayMs));
      }
      if (runnerState.cancelled) break;

      stepCounter++;
      // oxlint-disable-next-line no-await-in-loop
      const stepResult = await executeRunnerStep(
        item,
        iter,
        stepCounter,
        currentEnvMap,
        runnerState.config,
      );

      runnerState.results.push(stepResult);

      if (runnerState.config.stopOnFailure && !stepResult.passed) {
        toast.warn("Run stopped on failure", `${item.request.name || item.request.url} failed`);
        break;
      }
    }

    if (
      runnerState.config.stopOnFailure &&
      runnerState.results.some((r) => r.iteration === iter && !r.passed)
    ) {
      break;
    }
  }

  runnerState.running = false;
  runnerState.endTime = Date.now();

  const summary = getRunnerSummary();
  if (summary.totalTests > 0) {
    if (summary.failedTests === 0) {
      toast.success("Run completed", `All ${summary.totalTests} tests passed`);
    } else {
      toast.warn(
        "Run completed with failures",
        `${summary.passedTests}/${summary.totalTests} tests passed (${summary.failedTests} failed)`,
      );
    }
  } else {
    toast.success("Run completed", `${summary.completedRequests} requests sent`);
  }
}

export function getRunnerSummary(): RunnerSummary {
  const steps = runnerState.results;
  const totalRequests = steps.length;
  let totalTests = 0;
  let passedTests = 0;
  let totalDurationMs = 0;

  for (const s of steps) {
    totalDurationMs += s.timeMs ?? 0;
    for (const t of s.testResults) {
      totalTests++;
      if (t.passed) passedTests++;
    }
  }

  const failedTests = totalTests - passedTests;
  const avgTimeMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;

  return {
    containerName: runnerState.containerName,
    totalRequests,
    completedRequests: steps.length,
    totalTests,
    passedTests,
    failedTests,
    totalDurationMs:
      runnerState.startTime && runnerState.endTime
        ? runnerState.endTime - runnerState.startTime
        : totalDurationMs,
    avgTimeMs,
    steps,
  };
}

export async function exportRunnerReport(): Promise<void> {
  const summary = getRunnerSummary();
  const json = JSON.stringify(summary, null, 2);
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(json);
      toast.success("Report copied to clipboard", `${summary.completedRequests} requests recorded`);
    }
  } catch {
    toast.info("Report generated", `${summary.completedRequests} requests recorded`);
  }
}
