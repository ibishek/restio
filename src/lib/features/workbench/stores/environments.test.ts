import { beforeEach, describe, expect, it, vi } from "vitest";
import { wb } from "./workbench.svelte";
import {
  activeEnvKeys,
  activeEnvName,
  activeEnvironment,
  activeEnvVarMap,
  allAvailableEnvVarItems,
  getVariableInfo,
  selectEnvironment,
} from "./environments.svelte";

vi.mock("#lib/ipc", () => ({
  sendRequest: vi.fn(),
  pickFile: vi.fn(),
  saveResponseBody: vi.fn(),
  openFile: vi.fn(),
  dbGetEnvironments: vi.fn().mockResolvedValue([]),
  dbSaveEnvironments: vi.fn().mockResolvedValue(undefined),
  dbGetActiveEnvId: vi.fn().mockResolvedValue(null),
  dbSetActiveEnvId: vi.fn().mockResolvedValue(undefined),
}));

describe("environments store and variable resolution helpers", () => {
  beforeEach(() => {
    wb.environments = [
      {
        id: "env-dev",
        name: "Development",
        variables: [
          { id: "v1", key: "baseUrl", value: "http://localhost:3000", enabled: true },
          { id: "v2", key: "apiKey", value: "dev-key", enabled: true },
          { id: "v3", key: "disabledVar", value: "ignore-me", enabled: false },
        ],
      },
      {
        id: "env-prod",
        name: "Production",
        variables: [
          { id: "v4", key: "baseUrl", value: "https://api.example.com", enabled: true },
          { id: "v5", key: "prodOnly", value: "prod-secret", enabled: true },
        ],
      },
    ];
    wb.activeEnvId = "env-dev";
  });

  it("identifies active environment and its keys", () => {
    expect(activeEnvironment()?.name).toBe("Development");
    expect(activeEnvName()).toBe("Development");
    expect(activeEnvKeys()).toEqual(["baseUrl", "apiKey"]);
    const map = activeEnvVarMap();
    expect(map.get("baseUrl")).toBe("http://localhost:3000");
    expect(map.get("apiKey")).toBe("dev-key");
    expect(map.has("disabledVar")).toBe(false);
  });

  it("provides variable info when variable is defined in active environment", () => {
    const info = getVariableInfo("baseUrl");
    expect(info.isDefined).toBe(true);
    expect(info.value).toBe("http://localhost:3000");
    expect(info.envName).toBe("Development");
    expect(info.definedInOtherEnvs).toEqual([]);
  });

  it("identifies when variable is unresolved in active env but found in another environment", () => {
    const info = getVariableInfo("prodOnly");
    expect(info.isDefined).toBe(false);
    expect(info.value).toBeUndefined();
    expect(info.envName).toBe("Development");
    expect(info.definedInOtherEnvs).toEqual(["Production"]);
  });

  it("handles when no environment is active", () => {
    selectEnvironment(null);
    expect(activeEnvironment()).toBeNull();
    expect(activeEnvName()).toBe("No environment");

    const info = getVariableInfo("baseUrl");
    expect(info.isDefined).toBe(false);
    expect(info.envName).toBe("No environment");
    expect(info.definedInOtherEnvs).toContain("Development");
    expect(info.definedInOtherEnvs).toContain("Production");
  });

  it("lists all available variables prioritizing active environment", () => {
    const items = allAvailableEnvVarItems();
    const keys = items.map((i) => i.key);
    expect(keys).toContain("baseUrl");
    expect(keys).toContain("apiKey");
    expect(keys).toContain("prodOnly");

    const baseItem = items.find((i) => i.key === "baseUrl");
    expect(baseItem?.value).toBe("http://localhost:3000");
    expect(baseItem?.envName).toBe("Development");
    expect(baseItem?.isCurrentEnv).toBe(true);

    const prodItem = items.find((i) => i.key === "prodOnly");
    expect(prodItem?.value).toBe("prod-secret");
    expect(prodItem?.envName).toBe("Production");
    expect(prodItem?.isCurrentEnv).toBe(false);
  });
});
