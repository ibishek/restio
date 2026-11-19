import { describe, expect, it } from "vitest";
import {
  buildQueryString,
  mergeUrlWithParams,
  parseQueryString,
  splitUrl,
  syncParamsFromUrl,
} from "./query";

describe("splitUrl", () => {
  it("splits URL with query string", () => {
    expect(splitUrl("https://example.com/api?a=1&b=2")).toEqual({
      path: "https://example.com/api",
      query: "a=1&b=2",
    });
  });

  it("handles URL without query string", () => {
    expect(splitUrl("https://example.com/api")).toEqual({
      path: "https://example.com/api",
      query: "",
    });
  });

  it("handles empty string", () => {
    expect(splitUrl("")).toEqual({
      path: "",
      query: "",
    });
  });

  it("handles relative path with query string", () => {
    expect(splitUrl("/users?status=active")).toEqual({
      path: "/users",
      query: "status=active",
    });
  });
});

describe("parseQueryString", () => {
  it("parses key-value pairs", () => {
    expect(parseQueryString("foo=bar&baz=qux")).toEqual([
      { key: "foo", value: "bar" },
      { key: "baz", value: "qux" },
    ]);
  });

  it("parses valueless parameters as empty string", () => {
    expect(parseQueryString("debug&verbose=true")).toEqual([
      { key: "debug", value: "" },
      { key: "verbose", value: "true" },
    ]);
  });

  it("decodes URI encoded characters", () => {
    expect(parseQueryString("search=hello%20world&tag=a%2Bb")).toEqual([
      { key: "search", value: "hello world" },
      { key: "tag", value: "a+b" },
    ]);
  });

  it("preserves template variables", () => {
    expect(parseQueryString("user={{user_id}}&token={{auth_token}}")).toEqual([
      { key: "user", value: "{{user_id}}" },
      { key: "token", value: "{{auth_token}}" },
    ]);
  });

  it("returns empty array for empty query string", () => {
    expect(parseQueryString("")).toEqual([]);
  });
});

describe("buildQueryString", () => {
  it("builds query string from enabled rows", () => {
    const params = [
      { key: "foo", value: "bar", enabled: true },
      { key: "disabled", value: "no", enabled: false },
      { key: "baz", value: "qux", enabled: true },
      { key: "", value: "", enabled: true },
    ];
    expect(buildQueryString(params)).toBe("foo=bar&baz=qux");
  });

  it("formats valueless key properly", () => {
    const params = [{ key: "flag", value: "", enabled: true }];
    expect(buildQueryString(params)).toBe("flag");
  });

  it("returns empty string when no active params", () => {
    expect(buildQueryString([])).toBe("");
    expect(buildQueryString([{ key: "", value: "", enabled: true }])).toBe("");
    expect(buildQueryString([{ key: "a", value: "1", enabled: false }])).toBe("");
  });
});

describe("mergeUrlWithParams", () => {
  it("replaces existing query string with active params", () => {
    const url = "https://example.com/api?old=1";
    const params = [{ key: "new", value: "2", enabled: true }];
    expect(mergeUrlWithParams(url, params)).toBe("https://example.com/api?new=2");
  });

  it("removes query string when active params are empty", () => {
    const url = "https://example.com/api?old=1";
    const params = [{ key: "", value: "", enabled: true }];
    expect(mergeUrlWithParams(url, params)).toBe("https://example.com/api");
  });

  it("appends query string to URL with no existing query", () => {
    const url = "https://example.com/api";
    const params = [{ key: "a", value: "1", enabled: true }];
    expect(mergeUrlWithParams(url, params)).toBe("https://example.com/api?a=1");
  });
});

describe("syncParamsFromUrl", () => {
  let idCounter = 0;
  const mockId = () => `id-${++idCounter}`;

  it("creates params from URL query string", () => {
    const url = "https://example.com/api?foo=bar&baz=qux";
    const current = [{ id: "empty-1", key: "", value: "", enabled: true }];

    const result = syncParamsFromUrl(url, current, mockId);
    expect(result).toHaveLength(3); // 2 params + 1 trailing empty
    expect(result[0]).toMatchObject({ key: "foo", value: "bar", enabled: true });
    expect(result[1]).toMatchObject({ key: "baz", value: "qux", enabled: true });
    expect(result[2]).toMatchObject({ key: "", value: "", enabled: true });
  });

  it("preserves disabled rows when URL query changes", () => {
    const url = "https://example.com/api?active=yes";
    const current = [
      { id: "row-1", key: "active", value: "old", enabled: true },
      { id: "row-2", key: "inactive", value: "still_here", enabled: false },
      { id: "empty-1", key: "", value: "", enabled: true },
    ];

    const result = syncParamsFromUrl(url, current, mockId);
    expect(result[0]).toMatchObject({ id: "row-1", key: "active", value: "yes", enabled: true });
    expect(result[1]).toMatchObject({
      id: "row-2",
      key: "inactive",
      value: "still_here",
      enabled: false,
    });
    expect(result[2]).toMatchObject({ key: "", value: "", enabled: true });
  });

  it("returns currentParams unchanged if already matching", () => {
    const url = "https://example.com/api?a=1";
    const current = [
      { id: "row-1", key: "a", value: "1", enabled: true },
      { id: "empty-1", key: "", value: "", enabled: true },
    ];

    const result = syncParamsFromUrl(url, current, mockId);
    expect(result).toBe(current);
  });
});
