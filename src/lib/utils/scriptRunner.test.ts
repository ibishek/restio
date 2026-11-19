import { describe, expect, it } from "vitest";
import type { HttpResponse } from "#lib/types";
import { runScript } from "./scriptRunner";

describe("scriptRunner", () => {
  const dummyRequest = {
    url: "https://api.example.com/users",
    method: "GET" as const,
    headers: [{ id: "h1", key: "Authorization", value: "Bearer token", enabled: true }],
    body: "",
  };

  const dummyResponse: HttpResponse = {
    status: 200,
    statusText: "OK",
    timeMs: 45,
    sizeBytes: 128,
    headers: { "content-type": "application/json", "x-request-id": "req-123" },
    body: JSON.stringify({
      id: 42,
      name: "Alice",
      token: "secret-token-xyz",
      roles: ["admin", "editor"],
      active: true,
    }),
    bodyEncoding: "utf8",
  };

  it("sets environment variables with rio.setEnv and rio.environment.set", async () => {
    const code = `
      rio.setEnv("user_id", "42");
      rio.environment.set("auth_token", "abc-123");
      const readBack = rio.getEnv("user_id");
      rio.test("Read back env matches", () => {
        rio.expect(readBack).to.equal("42");
      });
    `;

    const result = await runScript(code, {
      environment: { base_url: "https://example.com" },
      request: dummyRequest,
    });

    expect(result.success).toBe(true);
    expect(result.environmentUpdates).toEqual({
      user_id: "42",
      auth_token: "abc-123",
    });
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("extracts token from response and sets environment variable", async () => {
    const code = `
      const res = rio.response.json();
      rio.test("Status code is 200", () => {
        rio.response.to.have.status(200);
      });
      rio.test("Extract token", () => {
        rio.expect(res.token).to.be.a("string");
        rio.setEnv("access_token", res.token);
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
      response: dummyResponse,
    });

    expect(result.success).toBe(true);
    expect(result.environmentUpdates).toEqual({
      access_token: "secret-token-xyz",
    });
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults[0].passed).toBe(true);
    expect(result.testResults[1].passed).toBe(true);
  });

  it("handles assertion failures cleanly with error descriptions", async () => {
    const code = `
      rio.test("Failing test on status", () => {
        rio.response.to.have.status(404);
      });
      rio.test("Passing test on name", () => {
        rio.expect(rio.response.json().name).to.equal("Alice");
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
      response: dummyResponse,
    });

    expect(result.success).toBe(false);
    expect(result.testResults).toHaveLength(2);
    expect(result.testResults[0].passed).toBe(false);
    expect(result.testResults[0].error).toContain("404");
    expect(result.testResults[1].passed).toBe(true);
  });

  it("supports Chai-like assertion chaining", async () => {
    const code = `
      const data = rio.response.json();
      rio.test("Chai assertions", () => {
        rio.expect(data.id).to.be.a("number");
        rio.expect(data.name).to.equal("Alice");
        rio.expect(data.roles).to.be.an("array").and.to.include("admin");
        rio.expect(data.active).to.be.true;
        rio.expect(data).to.have.property("id", 42);
        rio.expect(rio.response.time).to.be.below(1000);
        rio.expect(rio.response.headers.get("X-Request-Id")).to.equal("req-123");
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
      response: dummyResponse,
    });

    expect(result.success).toBe(true);
    expect(result.testResults[0].passed).toBe(true);
  });

  it("captures console logs", async () => {
    const code = `
      console.log("Starting test script...");
      console.warn("Notice: testing warning message");
      rio.setEnv("ran", "true");
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
    });

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]).toBe("Starting test script...");
    expect(result.logs[1]).toContain("[WARN] Notice: testing warning message");
  });

  it("supports async rio.test functions", async () => {
    const code = `
      rio.test("Async test", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        rio.expect(2 + 2).to.equal(4);
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
    });

    expect(result.success).toBe(true);
    expect(result.testResults[0].passed).toBe(true);
    expect(result.testResults[0].durationMs).toBeGreaterThanOrEqual(5);
  });

  it("retains pm alias for backward compatibility", async () => {
    const code = `
      pm.setEnv("from_pm", "yes");
      pm.test("PM alias works", () => {
        pm.expect(pm.response.code).to.equal(200);
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
      response: dummyResponse,
    });

    expect(result.success).toBe(true);
    expect(result.environmentUpdates).toEqual({ from_pm: "yes" });
    expect(result.testResults[0].passed).toBe(true);
  });

  it("handles syntax or runtime errors outside tests", async () => {
    const code = `
      const foo = null;
      foo.nonExistentMethod();
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("provides faker in sandbox and allows setting dynamic fake payloads", async () => {
    const code = `
      // Verify faker is accessible directly and via rio.faker
      const name = faker.person.fullName();
      const email = rio.faker.internet.email();
      const uuid = faker.string.uuid();

      rio.setEnv("generatedName", name);
      rio.setEnv("generatedEmail", email);

      const fakePayload = {
        name,
        email,
        uuid,
        active: true,
      };

      rio.request.body = JSON.stringify(fakePayload);

      rio.test("Faker generated valid non-empty fields", () => {
        rio.expect(name).to.be.a("string");
        rio.expect(name.length).to.be.above(0);
        rio.expect(email).to.include("@");
        rio.expect(uuid.length).to.equal(36);
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
    });

    expect(result.success).toBe(true);
    expect(result.testResults[0].passed).toBe(true);
    expect(result.environmentUpdates.generatedName).toBeDefined();
    expect(result.environmentUpdates.generatedEmail).toContain("@");

    expect(result.requestUpdates).toBeDefined();
    expect(result.requestUpdates?.body).toBeDefined();

    const parsed = JSON.parse(result.requestUpdates!.body!);
    expect(parsed.name).toBe(result.environmentUpdates.generatedName);
    expect(parsed.email).toBe(result.environmentUpdates.generatedEmail);
    expect(parsed.uuid).toHaveLength(36);
    expect(parsed.active).toBe(true);
  });

  it("supports io and am aliases for RestIO scripts", async () => {
    const code = `
      io.setEnv("app_io", "RestIO");
      am.setEnv("app_am", "Legacy");
      io.test("IO alias works", () => {
        io.expect(io.getEnv("app_io")).to.equal("RestIO");
      });
      am.test("AM alias works", () => {
        am.expect(am.getEnv("app_am")).to.equal("Legacy");
      });
    `;

    const result = await runScript(code, {
      environment: {},
      request: dummyRequest,
    });

    expect(result.success).toBe(true);
    expect(result.testResults[0].passed).toBe(true);
    expect(result.testResults[1].passed).toBe(true);
    expect(result.environmentUpdates.app_io).toBe("RestIO");
    expect(result.environmentUpdates.app_am).toBe("Legacy");
  });
});
