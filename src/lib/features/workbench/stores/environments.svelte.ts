// Environment definitions, switching, and variable resolution.

import type { Environment } from "#lib/types";
import { buildVarMap, unresolvedVars } from "#lib/utils/interpolate";
import { kv, uid } from "./types";
import { persistActiveEnv, persistEnvironments, wb } from "./workbench.svelte";

/** The environment whose variables resolve into requests, or `null` when the
 *  user has selected "No environment". Reactive — reads `wb` $state. */
export function activeEnvironment(): Environment | null {
  return wb.environments.find((e) => e.id === wb.activeEnvId) ?? null;
}

/** Human label for the active environment (for the selector / status bar). */
export function activeEnvName(): string {
  return activeEnvironment()?.name ?? "No environment";
}

/** The variable names defined by the active environment (enabled, non-empty,
 *  de-duplicated) — the source for `{{var}}` autocomplete + highlight. Reactive. */
export function activeEnvKeys(): string[] {
  return [...buildVarMap(activeEnvironment()).keys()];
}

export interface VariableDetails {
  name: string;
  value: string | undefined;
  isDefined: boolean;
  envName: string;
  envId: string | null;
  definedInOtherEnvs: string[];
}

export interface EnvVarItem {
  key: string;
  value: string;
  envName: string;
  isCurrentEnv: boolean;
}

/** Map of key -> value for all enabled variables in the active environment. */
export function activeEnvVarMap(): Map<string, string> {
  return buildVarMap(activeEnvironment());
}

/** Retrieve detailed resolution information for a variable name against the
 *  active environment, plus discovery in other environments if unresolved. */
export function getVariableInfo(name: string): VariableDetails {
  const active = activeEnvironment();
  const activeMap = buildVarMap(active);
  const isDefined = activeMap.has(name);
  const value = isDefined ? activeMap.get(name) : undefined;
  const envName = activeEnvName();
  const envId = active?.id ?? null;

  const definedInOtherEnvs: string[] = [];
  if (!isDefined) {
    for (const env of wb.environments) {
      if (env.id !== wb.activeEnvId) {
        const otherMap = buildVarMap(env);
        if (otherMap.has(name)) {
          definedInOtherEnvs.push(env.name);
        }
      }
    }
  }

  return {
    name,
    value,
    isDefined,
    envName,
    envId,
    definedInOtherEnvs,
  };
}

/** All available environment variable items across active and other environments,
 *  with active environment entries prioritized first. */
export function allAvailableEnvVarItems(): EnvVarItem[] {
  const active = activeEnvironment();
  const result: EnvVarItem[] = [];
  const seen = new Set<string>();

  if (active) {
    const map = buildVarMap(active);
    for (const [key, value] of map.entries()) {
      seen.add(key);
      result.push({ key, value, envName: active.name, isCurrentEnv: true });
    }
  }

  for (const env of wb.environments) {
    if (env.id !== wb.activeEnvId) {
      const map = buildVarMap(env);
      for (const [key, value] of map.entries()) {
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ key, value, envName: env.name, isCurrentEnv: false });
        }
      }
    }
  }

  return result;
}

/** Switch the active environment (or `null` to send raw, un-resolved requests). */
export function selectEnvironment(id: string | null): void {
  wb.activeEnvId = id;
  void persistActiveEnv();
}

/** Create a new, empty environment and make it active. Returns its id. */
export function createEnvironment(name = "New environment"): string {
  const env: Environment = { id: uid(), name, variables: [kv()] };
  wb.environments.push(env);
  wb.activeEnvId = env.id;
  void persistEnvironments();
  void persistActiveEnv();
  return env.id;
}

/** Add an imported environment (e.g. from Postman) and make it active. Returns
 *  its id. The env carries its own fresh ids from the importer. */
export function addImportedEnvironment(env: Environment): string {
  wb.environments.push(env);
  wb.activeEnvId = env.id;
  void persistEnvironments();
  void persistActiveEnv();
  return env.id;
}

export function renameEnvironment(id: string, name: string): void {
  const env = wb.environments.find((e) => e.id === id);
  if (env) {
    env.name = name;
    void persistEnvironments();
  }
}

export function deleteEnvironment(id: string): void {
  const i = wb.environments.findIndex((e) => e.id === id);
  if (i === -1) return;
  wb.environments.splice(i, 1);
  if (wb.activeEnvId === id) {
    wb.activeEnvId = wb.environments[0]?.id ?? null;
    void persistActiveEnv();
  }
  void persistEnvironments();
}

/** Persist the variable edits for an environment (call after row mutations). */
export function saveEnvironmentVars(): void {
  void persistEnvironments();
}

/** Apply a batch of environment variable updates to the active environment (or create one). */
export function applyEnvUpdates(updates: Record<string, string>): void {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  let env = activeEnvironment();
  if (!env) {
    const newId = createEnvironment("Environment");
    env = wb.environments.find((e) => e.id === newId) ?? null;
  }
  if (!env) return;

  for (const [key, value] of Object.entries(updates)) {
    const existing = env.variables.find((v) => v.key === key);
    if (existing) {
      existing.value = value;
      existing.enabled = true;
    } else {
      const emptyIdx = env.variables.findIndex((v) => !v.key && !v.value);
      const row = kv(key, value, true);
      if (emptyIdx !== -1) {
        env.variables.splice(emptyIdx, 0, row);
      } else {
        env.variables.push(row);
      }
    }
  }

  if (!env.variables.some((v) => !v.key && !v.value)) {
    env.variables.push(kv());
  }

  void persistEnvironments();
}

/** Variable names the current request references but the active environment does
 *  not define — surfaced as a hint in the request editor before sending. */
export function currentUnresolved(): string[] {
  const activeTabId = wb.activeTabId;
  const tab = wb.tabs.find((t) => t.id === activeTabId) ?? wb.tabs[0] ?? null;
  return tab ? unresolvedVars(tab.request, activeEnvironment()) : [];
}
