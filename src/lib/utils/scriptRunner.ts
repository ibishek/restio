// Postman-compatible script execution engine and assertion runner.

import { faker } from "@faker-js/faker";
import type { HttpResponse, KeyValue, TestResult } from "#lib/types";

export interface ScriptContext {
  environment: Record<string, string>;
  request: {
    url: string;
    method: string;
    headers: KeyValue[];
    body: string;
  };
  response?: HttpResponse | null;
}

export interface RequestUpdates {
  body?: string;
  url?: string;
}

export interface ScriptExecutionOutput {
  success: boolean;
  testResults: TestResult[];
  environmentUpdates: Record<string, string>;
  requestUpdates?: RequestUpdates;
  logs: string[];
  error?: string;
}

/**
 * Chai-compatible assertion builder for `rio.expect(val)`.
 */
export class Expectation {
  private actual: unknown;
  private isNegated: boolean;
  private isDeep: boolean;

  constructor(actual: unknown, isNegated = false, isDeep = false) {
    this.actual = actual;
    this.isNegated = isNegated;
    this.isDeep = isDeep;
  }

  get not(): Expectation {
    return new Expectation(this.actual, !this.isNegated, this.isDeep);
  }

  get deep(): Expectation {
    return new Expectation(this.actual, this.isNegated, true);
  }

  // Chainable language words
  get to(): Expectation {
    return this;
  }
  get be(): Expectation {
    return this;
  }
  get been(): Expectation {
    return this;
  }
  get is(): Expectation {
    return this;
  }
  get that(): Expectation {
    return this;
  }
  get which(): Expectation {
    return this;
  }
  get and(): Expectation {
    return this;
  }
  get has(): Expectation {
    return this;
  }
  get have(): Expectation {
    return this;
  }
  get with(): Expectation {
    return this;
  }
  get at(): Expectation {
    return this;
  }
  get of(): Expectation {
    return this;
  }
  get same(): Expectation {
    return this;
  }

  private describe(val: unknown): string {
    if (typeof val === "string") return `"${val}"`;
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (typeof val === "object") {
      try {
        return JSON.stringify(val);
      } catch {
        return String(val);
      }
    }
    return String(val);
  }

  private assert(condition: boolean, message: string, negatedMessage?: string): void {
    const passed = this.isNegated ? !condition : condition;
    if (!passed) {
      const err = this.isNegated
        ? (negatedMessage ?? `Expected ${this.describe(this.actual)} not to ${message}`)
        : `Expected ${this.describe(this.actual)} to ${message}`;
      throw new Error(err);
    }
  }

  equal(expected: unknown): Expectation {
    if (this.isDeep) {
      return this.eql(expected);
    }
    this.assert(
      this.actual === expected,
      `equal ${this.describe(expected)}`,
      `Expected ${this.describe(this.actual)} not to equal ${this.describe(expected)}`,
    );
    return this;
  }

  eq(expected: unknown): Expectation {
    return this.equal(expected);
  }

  eql(expected: unknown): Expectation {
    const actStr = JSON.stringify(this.actual);
    const expStr = JSON.stringify(expected);
    this.assert(
      actStr === expStr,
      `deeply equal ${this.describe(expected)}`,
      `Expected ${this.describe(this.actual)} not to deeply equal ${this.describe(expected)}`,
    );
    return this;
  }

  a(expectedType: string): Expectation {
    const type = typeof this.actual;
    let match = false;
    if (expectedType === "array") {
      match = Array.isArray(this.actual);
    } else if (expectedType === "null") {
      match = this.actual === null;
    } else if (expectedType === "object") {
      match =
        this.actual !== null && typeof this.actual === "object" && !Array.isArray(this.actual);
    } else {
      match = type === expectedType;
    }
    this.assert(
      match,
      `be a ${expectedType}`,
      `Expected ${this.describe(this.actual)} not to be a ${expectedType}`,
    );
    return this;
  }

  an(expectedType: string): Expectation {
    return this.a(expectedType);
  }

  get true(): Expectation {
    this.assert(
      this.actual === true,
      "be true",
      `Expected ${this.describe(this.actual)} not to be true`,
    );
    return this;
  }

  get false(): Expectation {
    this.assert(
      this.actual === false,
      "be false",
      `Expected ${this.describe(this.actual)} not to be false`,
    );
    return this;
  }

  get null(): Expectation {
    this.assert(
      this.actual === null,
      "be null",
      `Expected ${this.describe(this.actual)} not to be null`,
    );
    return this;
  }

  get undefined(): Expectation {
    this.assert(
      this.actual === undefined,
      "be undefined",
      `Expected ${this.describe(this.actual)} not to be undefined`,
    );
    return this;
  }

  get ok(): Expectation {
    this.assert(
      Boolean(this.actual),
      "be truthy",
      `Expected ${this.describe(this.actual)} not to be truthy`,
    );
    return this;
  }

  get empty(): Expectation {
    let empty = false;
    if (typeof this.actual === "string" || Array.isArray(this.actual)) {
      empty = this.actual.length === 0;
    } else if (this.actual && typeof this.actual === "object") {
      empty = Object.keys(this.actual).length === 0;
    }
    this.assert(empty, "be empty", `Expected ${this.describe(this.actual)} not to be empty`);
    return this;
  }

  include(val: unknown): Expectation {
    let included = false;
    if (typeof this.actual === "string" && typeof val === "string") {
      included = this.actual.includes(val);
    } else if (Array.isArray(this.actual)) {
      included = this.actual.includes(val);
    } else if (this.actual && typeof this.actual === "object" && typeof val === "string") {
      included = val in (this.actual as Record<string, unknown>);
    }
    this.assert(
      included,
      `include ${this.describe(val)}`,
      `Expected ${this.describe(this.actual)} not to include ${this.describe(val)}`,
    );
    return this;
  }

  contain(val: unknown): Expectation {
    return this.include(val);
  }

  includes(val: unknown): Expectation {
    return this.include(val);
  }

  contains(val: unknown): Expectation {
    return this.include(val);
  }

  property(name: string, expectedVal?: unknown): Expectation {
    const hasProp =
      this.actual !== null &&
      typeof this.actual === "object" &&
      name in (this.actual as Record<string, unknown>);
    if (!hasProp) {
      this.assert(false, `have property "${name}"`);
      return this;
    }
    if (expectedVal !== undefined) {
      const val = (this.actual as Record<string, unknown>)[name];
      this.assert(
        this.isDeep ? JSON.stringify(val) === JSON.stringify(expectedVal) : val === expectedVal,
        `have property "${name}" with value ${this.describe(expectedVal)}`,
      );
    } else {
      this.assert(true, `have property "${name}"`);
    }
    return this;
  }

  length(len: number): Expectation {
    const actLen = (this.actual as { length?: number })?.length;
    this.assert(
      actLen === len,
      `have length ${len} but got ${actLen}`,
      `Expected length not to be ${len}`,
    );
    return this;
  }

  lengthOf(len: number): Expectation {
    return this.length(len);
  }

  match(regex: RegExp): Expectation {
    const match = typeof this.actual === "string" && regex.test(this.actual);
    this.assert(
      match,
      `match ${regex.toString()}`,
      `Expected ${this.describe(this.actual)} not to match ${regex.toString()}`,
    );
    return this;
  }

  above(n: number): Expectation {
    this.assert(
      typeof this.actual === "number" && this.actual > n,
      `be above ${n}`,
      `Expected ${this.describe(this.actual)} not to be above ${n}`,
    );
    return this;
  }

  greaterThan(n: number): Expectation {
    return this.above(n);
  }

  least(n: number): Expectation {
    this.assert(
      typeof this.actual === "number" && this.actual >= n,
      `be at least ${n}`,
      `Expected ${this.describe(this.actual)} not to be at least ${n}`,
    );
    return this;
  }

  below(n: number): Expectation {
    this.assert(
      typeof this.actual === "number" && this.actual < n,
      `be below ${n}`,
      `Expected ${this.describe(this.actual)} not to be below ${n}`,
    );
    return this;
  }

  lessThan(n: number): Expectation {
    return this.below(n);
  }

  most(n: number): Expectation {
    this.assert(
      typeof this.actual === "number" && this.actual <= n,
      `be at most ${n}`,
      `Expected ${this.describe(this.actual)} not to be at most ${n}`,
    );
    return this;
  }
}

/**
 * RestIO response helper: `rio.response` (also available via `io.response`, `am.response`, `pm.response`).
 */
export class RioResponse {
  code: number;
  status: string;
  statusText: string;
  time: number;
  responseTime: number;
  private rawBody: string;
  headers: {
    get(name: string): string | undefined;
    has(name: string): boolean;
    toObject(): Record<string, string>;
  };
  to: {
    have: {
      status(code: number): void;
      header(name: string, expectedVal?: string): void;
      jsonBody(expected?: unknown): void;
    };
    be: {
      readonly success: boolean;
      readonly ok: boolean;
      readonly clientError: boolean;
      readonly serverError: boolean;
    };
  };

  constructor(res: HttpResponse) {
    this.code = res.status;
    this.status = res.statusText || String(res.status);
    this.statusText = res.statusText || String(res.status);
    this.time = res.timeMs;
    this.responseTime = res.timeMs;
    this.rawBody = res.body;

    const headersMap = new Map<string, string>();
    for (const [k, v] of Object.entries(res.headers || {})) {
      headersMap.set(k.toLowerCase(), v);
    }

    const headerHelpers = {
      get: (name: string) => headersMap.get(name.toLowerCase()),
      has: (name: string) => headersMap.has(name.toLowerCase()),
      toObject: () => ({ ...res.headers }),
    };
    this.headers = headerHelpers;

    const statusCode = res.status;
    const rawBody = res.body;

    this.to = {
      have: {
        status(code: number) {
          if (statusCode !== code) {
            throw new Error(`Expected response status code to be ${code} but got ${statusCode}`);
          }
        },
        header(name: string, expectedVal?: string) {
          const val = headerHelpers.get(name);
          if (val === undefined) {
            throw new Error(`Expected response to have header "${name}"`);
          }
          if (expectedVal !== undefined && val !== expectedVal) {
            throw new Error(`Expected header "${name}" to be "${expectedVal}" but got "${val}"`);
          }
        },
        jsonBody(expected?: unknown) {
          if (!rawBody || !rawBody.trim()) {
            throw new Error("Response body is empty, cannot parse as JSON");
          }
          const parsed = JSON.parse(rawBody);
          if (expected !== undefined && JSON.stringify(parsed) !== JSON.stringify(expected)) {
            throw new Error("Expected JSON body to match expected shape");
          }
        },
      },
      be: {
        get success() {
          if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`Expected 2xx status code but got ${statusCode}`);
          }
          return true;
        },
        get ok() {
          if (statusCode < 200 || statusCode >= 300) {
            throw new Error(`Expected 2xx status code but got ${statusCode}`);
          }
          return true;
        },
        get clientError() {
          if (statusCode < 400 || statusCode >= 500) {
            throw new Error(`Expected 4xx client error status code but got ${statusCode}`);
          }
          return true;
        },
        get serverError() {
          if (statusCode < 500 || statusCode >= 600) {
            throw new Error(`Expected 5xx server error status code but got ${statusCode}`);
          }
          return true;
        },
      },
    };
  }

  text(): string {
    return this.rawBody;
  }

  json(): unknown {
    if (!this.rawBody || !this.rawBody.trim()) {
      throw new Error("Response body is empty, cannot parse as JSON");
    }
    return JSON.parse(this.rawBody);
  }
}

export { RioResponse as RestioResponse, RioResponse as AmResponse, RioResponse as PmResponse };

function formatArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Execute a user script in a sandboxed RestIO `rio` environment (with `io`, `am`, and `pm` aliases for compatibility).
 */
export async function runScript(
  scriptCode: string,
  context: ScriptContext,
  timeoutMs = 5000,
): Promise<ScriptExecutionOutput> {
  if (!scriptCode || !scriptCode.trim()) {
    return {
      success: true,
      testResults: [],
      environmentUpdates: {},
      logs: [],
    };
  }

  const envUpdates: Record<string, string> = {};
  const variables: Record<string, unknown> = {};
  const testResults: TestResult[] = [];
  const logs: string[] = [];
  const pendingTests: { name: string; fn: () => void | Promise<void> }[] = [];

  const scopedConsole = {
    log: (...args: unknown[]) => logs.push(args.map(formatArg).join(" ")),
    info: (...args: unknown[]) => logs.push(args.map(formatArg).join(" ")),
    warn: (...args: unknown[]) => logs.push("[WARN] " + args.map(formatArg).join(" ")),
    error: (...args: unknown[]) => logs.push("[ERROR] " + args.map(formatArg).join(" ")),
  };

  const initialEnv = context.environment;
  let requestBody = context.request.body;
  let requestUrl = context.request.url;

  const rio = {
    faker,
    environment: {
      get: (key: string): string | undefined => envUpdates[key] ?? initialEnv[key],
      set: (key: string, value: unknown): void => {
        const str = value === undefined || value === null ? "" : String(value);
        envUpdates[key] = str;
      },
      has: (key: string): boolean => key in envUpdates || key in initialEnv,
      unset: (key: string): void => {
        envUpdates[key] = "";
      },
      toObject: (): Record<string, string> => ({ ...initialEnv, ...envUpdates }),
    },
    // Direct shortcut aliases (e.g. rio.setEnv / rio.getEnv)
    setEnv: (key: string, value: unknown): void => {
      const str = value === undefined || value === null ? "" : String(value);
      envUpdates[key] = str;
    },
    getEnv: (key: string): string | undefined => envUpdates[key] ?? initialEnv[key],
    setBody: (val: unknown): void => {
      requestBody = typeof val === "string" ? val : JSON.stringify(val);
    },
    variables: {
      get: (key: string): unknown => variables[key] ?? envUpdates[key] ?? initialEnv[key],
      set: (key: string, value: unknown): void => {
        variables[key] = value;
      },
    },
    request: {
      get url(): string {
        return requestUrl;
      },
      set url(val: string) {
        requestUrl = val;
      },
      method: context.request.method,
      headers: {
        get: (name: string): string | undefined =>
          context.request.headers.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value,
        toObject: (): Record<string, string> =>
          Object.fromEntries(context.request.headers.map((h) => [h.key, h.value])),
      },
      get body(): string {
        return requestBody;
      },
      set body(val: unknown) {
        requestBody = typeof val === "string" ? val : JSON.stringify(val);
      },
      setBody(val: unknown): void {
        requestBody = typeof val === "string" ? val : JSON.stringify(val);
      },
    },
    response: context.response ? new RioResponse(context.response) : null,
    test: (name: string, fn: () => void | Promise<void>): void => {
      pendingTests.push({ name, fn });
    },
    expect: (actual: unknown): Expectation => new Expectation(actual),
  };

  // Aliases for short form (`io`), legacy APIMan (`am`), and Postman (`pm`) scripts
  const io = rio;
  const am = rio;
  const pm = rio;

  let topLevelError: string | undefined;

  try {
    // Construct isolated function execution
    // Shadow sensitive globals (window, document, fetch, eval, localStorage, etc.)
    const fn = new Function(
      "rio",
      "io",
      "am",
      "pm",
      "faker",
      "console",
      "btoa",
      "atob",
      "JSON",
      "Math",
      "Date",
      "RegExp",
      "crypto",
      "window",
      "document",
      "fetch",
      "XMLHttpRequest",
      "localStorage",
      "sessionStorage",
      `"use strict"; return (async () => {\n${scriptCode}\n})();`,
    );

    const execPromise = fn(
      rio,
      io,
      am,
      pm,
      faker,
      scopedConsole,
      btoa,
      atob,
      JSON,
      Math,
      Date,
      RegExp,
      typeof crypto !== "undefined" ? crypto : null,
      null,
      null,
      null,
      null,
      null,
      null,
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Script timed out after ${timeoutMs}ms`)), timeoutMs),
    );

    await Promise.race([execPromise, timeoutPromise]);
  } catch (e) {
    topLevelError = e instanceof Error ? e.message : String(e);
    scopedConsole.error("Script execution failed:", topLevelError);
  }

  // Execute all registered rio.test() assertions
  for (const t of pendingTests) {
    const start = Date.now();
    try {
      const res = t.fn();
      if (res && typeof res.then === "function") {
        // oxlint-disable-next-line no-await-in-loop
        await Promise.race([
          res,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Test timed out after ${timeoutMs}ms`)), timeoutMs),
          ),
        ]);
      }
      testResults.push({
        name: t.name,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      testResults.push({
        name: t.name,
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }
  }

  const allPassed = !topLevelError && testResults.every((t) => t.passed);

  const requestUpdates: RequestUpdates = {};
  if (requestBody !== context.request.body) {
    requestUpdates.body = requestBody;
  }
  if (requestUrl !== context.request.url) {
    requestUpdates.url = requestUrl;
  }

  return {
    success: allPassed,
    testResults,
    environmentUpdates: envUpdates,
    requestUpdates,
    logs,
    error: topLevelError,
  };
}
