import { describe, expect, it } from "vitest";
import type { Collection } from "#lib/types";
import {
  filterPaletteItems,
  flattenRequests,
  parseSearchPrefix,
  scoreItem,
  type PaletteItem,
} from "./search";
import { makeRequest } from "#lib/features/workbench/stores/types";

const dummyAction = () => {};

describe("Search & Command Palette Engine", () => {
  it("flattens nested collections and folders into request items with trails", () => {
    const r1 = makeRequest("List Repos", "GET", "/repos");
    const r2 = makeRequest("Get Issue", "GET", "/issues/1");
    const r3 = makeRequest("Create Release", "POST", "/releases");

    const collections: Collection[] = [
      {
        id: "c1",
        name: "GitHub API",
        baseUrl: "https://api.github.com",
        folders: [
          {
            id: "f1",
            name: "Issues",
            urlPrefix: "/issues",
            folders: [],
            requests: [r2],
            auth: {
              type: "inherit",
              bearer: { token: "" },
              basic: { username: "", password: "" },
              apiKey: { key: "", value: "", addTo: "header" },
            },
          },
          {
            id: "f2",
            name: "Releases",
            urlPrefix: "/releases",
            folders: [],
            requests: [r3],
            auth: {
              type: "inherit",
              bearer: { token: "" },
              basic: { username: "", password: "" },
              apiKey: { key: "", value: "", addTo: "header" },
            },
          },
        ],
        requests: [r1],
      },
    ];

    const flat = flattenRequests(collections);
    expect(flat).toHaveLength(3);

    expect(flat[0].req.name).toBe("List Repos");
    expect(flat[0].trail).toBe("GitHub API");
    expect(flat[0].loc).toEqual({ collectionId: "c1", folderIds: [] });

    expect(flat[1].req.name).toBe("Get Issue");
    expect(flat[1].trail).toBe("GitHub API / Issues");
    expect(flat[1].loc).toEqual({ collectionId: "c1", folderIds: ["f1"] });

    expect(flat[2].req.name).toBe("Create Release");
    expect(flat[2].trail).toBe("GitHub API / Releases");
    expect(flat[2].loc).toEqual({ collectionId: "c1", folderIds: ["f2"] });
  });

  it("parses query prefixes for category filtering", () => {
    expect(parseSearchPrefix("> send")).toEqual({
      categoryFilter: "commands",
      cleanQuery: "send",
    });

    expect(parseSearchPrefix("cmd: new")).toEqual({
      categoryFilter: "commands",
      cleanQuery: "new",
    });

    expect(parseSearchPrefix("/ users")).toEqual({
      categoryFilter: "requests",
      cleanQuery: "users",
    });

    expect(parseSearchPrefix("req: login")).toEqual({
      categoryFilter: "requests",
      cleanQuery: "login",
    });

    expect(parseSearchPrefix("hist: 404")).toEqual({
      categoryFilter: "history",
      cleanQuery: "404",
    });

    expect(parseSearchPrefix("env: prod")).toEqual({
      categoryFilter: "environments",
      cleanQuery: "prod",
    });

    expect(parseSearchPrefix("ws: personal")).toEqual({
      categoryFilter: "workspaces",
      cleanQuery: "personal",
    });

    expect(parseSearchPrefix("simple search")).toEqual({
      categoryFilter: null,
      cleanQuery: "simple search",
    });
  });

  it("scores items by title, method, subtitle, and keywords", () => {
    const item1: PaletteItem = {
      id: "1",
      category: "requests",
      title: "Get User Profile",
      subtitle: "/api/users/profile",
      method: "GET",
      action: dummyAction,
    };

    const item2: PaletteItem = {
      id: "2",
      category: "requests",
      title: "Update User",
      subtitle: "/api/users",
      method: "PUT",
      action: dummyAction,
    };

    const score1 = scoreItem(item1, ["get", "user"]);
    const score2 = scoreItem(item2, ["get", "user"]);

    // item1 matches method 'get' AND title 'user'
    expect(score1).toBeGreaterThan(0);
    // item2 does NOT match 'get'
    expect(score2).toBe(0);
  });

  it("filters and ranks palette items by relevance", () => {
    const sampleItems: PaletteItem[] = [
      {
        id: "c-send",
        category: "commands",
        title: "Send current request",
        shortcut: ["⌘", "↵"],
        action: dummyAction,
      },
      {
        id: "c-save",
        category: "commands",
        title: "Save request",
        shortcut: ["⌘", "S"],
        action: dummyAction,
      },
      {
        id: "r-user",
        category: "requests",
        title: "Get User",
        subtitle: "Users / /users/{{id}}",
        method: "GET",
        action: dummyAction,
      },
      {
        id: "r-list",
        category: "requests",
        title: "List Users",
        subtitle: "Users / /users",
        method: "GET",
        action: dummyAction,
      },
      {
        id: "e-prod",
        category: "environments",
        title: "Production",
        action: dummyAction,
      },
    ];

    // Filter by category prefix
    const commandsOnly = filterPaletteItems(sampleItems, "> request");
    expect(commandsOnly).toHaveLength(2);
    expect(commandsOnly[0].category).toBe("commands");
    expect(commandsOnly[1].category).toBe("commands");

    // Filter across all
    const userMatches = filterPaletteItems(sampleItems, "users");
    expect(userMatches).toHaveLength(2);
    expect(userMatches.map((m) => m.id)).toEqual(["r-list", "r-user"]);

    // Empty query returns all pool items
    const all = filterPaletteItems(sampleItems, "");
    expect(all).toHaveLength(5);
  });
});
