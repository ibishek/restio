import { describe, expect, it } from "vitest";
import { buildVarMap, findVars, interpolate, splitVars } from "./interpolate";
import type { Environment } from "#lib/types";

describe("interpolate utils", () => {
  const env: Environment = {
    id: "env-1",
    name: "Production",
    variables: [
      { id: "1", key: "base_url", value: "https://api.example.com", enabled: true },
      { id: "2", key: "token", value: "secret-token-123", enabled: true },
      { id: "3", key: "disabled_var", value: "should-not-resolve", enabled: false },
      { id: "4", key: "dup_key", value: "first", enabled: true },
      { id: "5", key: "dup_key", value: "second", enabled: true },
    ],
  };

  it("builds variable map ignoring disabled rows and honoring last duplicate", () => {
    const map = buildVarMap(env);
    expect(map.get("base_url")).toBe("https://api.example.com");
    expect(map.get("token")).toBe("secret-token-123");
    expect(map.has("disabled_var")).toBe(false);
    expect(map.get("dup_key")).toBe("second");
  });

  it("interpolates variables in template strings", () => {
    const map = buildVarMap(env);
    expect(interpolate("{{base_url}}/users?auth={{token}}", map)).toBe(
      "https://api.example.com/users?auth=secret-token-123",
    );
  });

  it("leaves unknown variables verbatim", () => {
    const map = buildVarMap(env);
    expect(interpolate("{{unknown_var}}/path", map)).toBe("{{unknown_var}}/path");
  });

  it("finds all distinct variable names in a string", () => {
    const vars = findVars("{{base_url}}/items/{{item_id}}?token={{base_url}}");
    expect(vars).toEqual(["base_url", "item_id"]);
  });

  it("splits text into variable segments for UI highlighting", () => {
    const segs = splitVars("https://{{base_url}}/api/{{id}}");
    expect(segs).toEqual([
      { text: "https://" },
      { text: "{{base_url}}", name: "base_url" },
      { text: "/api/" },
      { text: "{{id}}", name: "id" },
    ]);
  });
});
