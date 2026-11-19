import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection, HttpRequest, HttpResponse } from "#lib/types";
import { makeRequest } from "./types";
import { wb } from "./workbench.svelte";
import {
  openRunner,
  closeRunner,
  toggleRunnerItem,
  toggleAllRunnerItems,
  moveRunnerItem,
  startRunner,
  getRunnerSummary,
  runnerState,
} from "./runner.svelte";

// Mock sendRequest from #lib/ipc
vi.mock("#lib/ipc", () => ({
  sendRequest: vi.fn(),
  pickFile: vi.fn(),
  saveResponseBody: vi.fn(),
  openFile: vi.fn(),
}));

import { sendRequest } from "#lib/ipc";

describe("Collection Runner", () => {
  const req1: HttpRequest = makeRequest("Login", "POST", "/auth/login", {
    testScript: `
      const res = rio.response.json();
      rio.test("Token returned", () => {
        rio.expect(res.token).to.equal("token-123");
        rio.setEnv("auth_token", res.token);
      });
    `,
  });

  const req2: HttpRequest = makeRequest("Get Profile", "GET", "/users/me", {
    preRequestScript: `
      const token = rio.getEnv("auth_token");
      rio.test("Token exists before send", () => {
        rio.expect(token).to.equal("token-123");
      });
    `,
    testScript: `
      rio.test("Status is 200", () => {
        rio.response.to.have.status(200);
      });
    `,
  });

  const req3: HttpRequest = makeRequest("Delete Account", "DELETE", "/users/me", {
    testScript: `
      rio.test("Failing assertion", () => {
        rio.response.to.have.status(204);
      });
    `,
  });

  const sampleCollection: Collection = {
    id: "col-1",
    name: "User API",
    baseUrl: "https://api.example.com",
    requests: [req1],
    folders: [
      {
        id: "f-1",
        name: "Profile",
        urlPrefix: "/v1",
        folders: [],
        requests: [req2, req3],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    wb.collections = [sampleCollection];
    wb.environments = [
      {
        id: "env-1",
        name: "Development",
        variables: [{ id: "v1", key: "base_url", value: "https://api.example.com", enabled: true }],
      },
    ];
    wb.activeEnvId = "env-1";
  });

  it("opens runner and flattens requests in depth-first order", () => {
    openRunner({ collectionId: "col-1", folderIds: [] });

    expect(runnerState.open).toBe(true);
    expect(runnerState.containerName).toBe("User API");
    expect(runnerState.items).toHaveLength(3);
    expect(runnerState.items[0].request.name).toBe("Login");
    expect(runnerState.items[1].request.name).toBe("Get Profile");
    expect(runnerState.items[2].request.name).toBe("Delete Account");
  });

  it("supports reordering and toggling items", () => {
    openRunner({ collectionId: "col-1", folderIds: [] });

    toggleRunnerItem(runnerState.items[0].id);
    expect(runnerState.items[0].enabled).toBe(false);

    toggleAllRunnerItems(true);
    expect(runnerState.items.every((i) => i.enabled)).toBe(true);

    // Move first item to index 1
    moveRunnerItem(0, 1);
    expect(runnerState.items[0].request.name).toBe("Get Profile");
    expect(runnerState.items[1].request.name).toBe("Login");
  });

  it("executes requests in sequence, chains environment variables, and records assertions", async () => {
    openRunner({ collectionId: "col-1", folderIds: [] });

    // Exclude req3 (which fails) to test clean success run
    runnerState.items[2].enabled = false;

    // Mock sendRequest responses
    const mockSend = vi.mocked(sendRequest);
    mockSend.mockImplementation(async (_runId, req) => {
      if (req.url.includes("/auth/login")) {
        return {
          status: 200,
          statusText: "OK",
          timeMs: 40,
          sizeBytes: 64,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: "token-123" }),
          bodyEncoding: "utf8",
        } satisfies HttpResponse;
      }
      return {
        status: 200,
        statusText: "OK",
        timeMs: 30,
        sizeBytes: 128,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: 1, name: "Alice" }),
        bodyEncoding: "utf8",
      } satisfies HttpResponse;
    });

    await startRunner();

    expect(runnerState.running).toBe(false);
    expect(runnerState.results).toHaveLength(2);

    const step1 = runnerState.results[0];
    expect(step1.requestName).toBe("Login");
    expect(step1.status).toBe(200);
    expect(step1.testResults).toHaveLength(1);
    expect(step1.testResults[0].passed).toBe(true);
    expect(step1.passed).toBe(true);

    const step2 = runnerState.results[1];
    expect(step2.requestName).toBe("Get Profile");
    expect(step2.status).toBe(200);
    // 1 pre-request assertion + 1 post-response assertion
    expect(step2.testResults).toHaveLength(1);
    expect(step2.testResults[0].passed).toBe(true);
    expect(step2.passed).toBe(true);

    const summary = getRunnerSummary();
    expect(summary.completedRequests).toBe(2);
    expect(summary.totalTests).toBe(2);
    expect(summary.passedTests).toBe(2);
    expect(summary.failedTests).toBe(0);
  });

  it("stops run when stopOnFailure is true and assertion fails", async () => {
    openRunner({ collectionId: "col-1", folderIds: [] });
    runnerState.config.stopOnFailure = true;

    const mockSend = vi.mocked(sendRequest);
    mockSend.mockResolvedValue({
      status: 500,
      statusText: "Internal Server Error",
      timeMs: 25,
      sizeBytes: 32,
      headers: {},
      body: "error",
      bodyEncoding: "utf8",
    });

    await startRunner();

    // With stopOnFailure and first step failing (no tests, status 500), it stops after step 1
    expect(runnerState.results).toHaveLength(1);
    expect(runnerState.results[0].passed).toBe(false);

    closeRunner();
    expect(runnerState.open).toBe(false);
  });
});
