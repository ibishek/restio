import { describe, expect, it } from "vitest";
import { makeRequest } from "#lib/features/workbench/stores/types";
import { CODE_TARGETS, generateCode } from "./codegen";

describe("codegen dollar escaping and code generation", () => {
  it("escapes $ and \\ correctly in Kotlin OkHttp", () => {
    const req = makeRequest("Test", "POST", "https://api.example.com/v1/pay", {
      bodyMode: "json",
      body: JSON.stringify({
        amount: "$100",
        path: "C:\\Users\\test",
        combo: "price \\$99",
      }),
    });

    const code = generateCode("kotlin", req);
    expect(code).toContain(String.raw`\$100`);
    expect(code).toContain(String.raw`C:\\\\Users\\\\test`);
    expect(code).toContain(String.raw`price \\\\\$99`);
  });

  it("escapes $ and \\ correctly in Dart http", () => {
    const req = makeRequest("Test", "POST", "https://api.example.com/v1/$price", {
      bodyMode: "json",
      body: '{"variable": "$val", "escaped": "\\$"}',
    });

    const code = generateCode("dart", req);
    expect(code).toContain("https://api.example.com/v1/\\$price");
    expect(code).toContain("\\$val");
    expect(code).toContain("\\\\\\$");
  });

  it("escapes $ and \\ correctly in Dart Dio", () => {
    const req = makeRequest("Test", "POST", "https://api.example.com/v1/item", {
      bodyMode: "json",
      body: '{"total": "$50"}',
    });

    const code = generateCode("dio", req);
    expect(code).toContain("\\$50");
  });

  it("generates code for all supported targets without throwing", () => {
    const req = makeRequest("All Targets", "GET", "https://api.example.com/users?search=$query", {
      bodyMode: "none",
    });

    for (const target of CODE_TARGETS) {
      const code = generateCode(target.id, req);
      expect(typeof code).toBe("string");
      expect(code.length).toBeGreaterThan(0);
    }
  });
});
