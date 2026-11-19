import { describe, expect, it } from "vitest";
import { isCurlCommand, parseCurl } from "./curl";

describe("curl utils", () => {
  it("detects curl command strings", () => {
    expect(isCurlCommand("curl https://example.com")).toBe(true);
    expect(isCurlCommand("$ curl -X POST https://example.com")).toBe(true);
    expect(isCurlCommand("  CURL https://example.com")).toBe(true);
    expect(isCurlCommand("wget https://example.com")).toBe(false);
  });

  it("parses simple GET request with query params", () => {
    const res = parseCurl("curl 'https://api.example.com/items?limit=10&offset=0'");
    expect(res).not.toBeNull();
    expect(res!.method).toBe("GET");
    expect(res!.url).toBe("https://api.example.com/items");
    expect(res!.params).toEqual([
      { key: "limit", value: "10" },
      { key: "offset", value: "0" },
    ]);
  });

  it("parses POST with JSON body and headers", () => {
    const cmd = `curl -X POST https://api.example.com/users \\
      -H "Content-Type: application/json" \\
      -H "Authorization: Bearer token-xyz" \\
      -d '{"name": "Alice", "role": "admin"}'`;

    const res = parseCurl(cmd);
    expect(res).not.toBeNull();
    expect(res!.method).toBe("POST");
    expect(res!.url).toBe("https://api.example.com/users");
    expect(res!.bodyMode).toBe("json");
    expect(res!.body).toBe('{"name": "Alice", "role": "admin"}');
    expect(res!.headers).toContainEqual({ key: "Authorization", value: "Bearer token-xyz" });
  });

  it("parses form-urlencoded data with -d", () => {
    const cmd = `curl -X POST https://api.example.com/login -d "user=alice&pass=secret"`;
    const res = parseCurl(cmd);
    expect(res).not.toBeNull();
    expect(res!.method).toBe("POST");
    expect(res!.bodyMode).toBe("form");
    expect(res!.formFields).toEqual([
      { key: "user", value: "alice" },
      { key: "pass", value: "secret" },
    ]);
  });

  it("parses basic auth flag -u", () => {
    const cmd = `curl -u "admin:secret" https://api.example.com/admin`;
    const res = parseCurl(cmd);
    expect(res).not.toBeNull();
    expect(res!.headers).toContainEqual({
      key: "Authorization",
      value: `Basic ${btoa("admin:secret")}`,
    });
  });
});
