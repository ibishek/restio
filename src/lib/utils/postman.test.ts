import { describe, expect, it } from "vitest";
import { fromPostman, toPostman } from "./postman";
import type { Collection } from "#lib/types";

describe("postman conversion utils", () => {
  const collection: Collection = {
    id: "col-1",
    name: "My API",
    baseUrl: "https://api.example.com",
    folders: [
      {
        id: "folder-1",
        name: "Users",
        urlPrefix: "/v1",
        folders: [],
        requests: [
          {
            id: "req-1",
            name: "Get User",
            method: "GET",
            url: "/users/123",
            params: [],
            headers: [{ id: "h1", key: "Accept", value: "application/json", enabled: true }],
            auth: {
              type: "bearer",
              bearer: { token: "my-token" },
              basic: { username: "", password: "" },
              apiKey: { key: "", value: "", addTo: "header" },
            },
            bodyMode: "none",
            body: "",
            formFields: [],
            multipart: [],
            binaryPath: "",
            preRequestScript: "pm.setEnv('timestamp', Date.now());",
            testScript: "pm.test('Status is 200', () => { pm.response.to.have.status(200); });",
            savedResponses: [
              {
                id: "ex-1",
                name: "200 OK User",
                status: 200,
                statusText: "OK",
                timeMs: 45,
                sizeBytes: 25,
                headers: { "content-type": "application/json" },
                body: '{"id":123,"name":"Alice"}',
                bodyEncoding: "utf8",
                createdAt: 1700000000000,
              },
            ],
          },
        ],
      },
    ],
    requests: [],
  };

  it("exports collection to Postman v2.1 schema format with composed URLs and saved responses", () => {
    const pm = toPostman(collection);
    expect(pm.info.name).toBe("My API");
    expect(pm.info.schema).toContain("collection.json");
    expect(pm.item).toHaveLength(1);

    const folderItem = pm.item[0];
    expect(folderItem.name).toBe("Users");
    expect(folderItem.item).toHaveLength(1);

    const reqItem = folderItem.item![0];
    expect(reqItem.name).toBe("Get User");
    const rawUrl = (reqItem.request as { url: { raw: string } }).url.raw;
    expect(rawUrl).toBe("https://api.example.com/v1/users/123");
    expect(reqItem.event).toBeDefined();
    expect(reqItem.event).toHaveLength(2);

    expect(reqItem.response).toBeDefined();
    expect(reqItem.response).toHaveLength(1);
    const resp = (reqItem.response as Array<{ name: string; code: number; body: string }>)[0];
    expect(resp.name).toBe("200 OK User");
    expect(resp.code).toBe(200);
    expect(resp.body).toBe('{"id":123,"name":"Alice"}');
  });

  it("imports Postman collection format back into internal collection tree with saved responses", () => {
    const pm = toPostman(collection);
    const roundTrip = fromPostman(pm);
    expect(roundTrip).not.toBeNull();
    expect(roundTrip!.name).toBe("My API");
    expect(roundTrip!.folders).toHaveLength(1);
    expect(roundTrip!.folders[0].name).toBe("Users");
    expect(roundTrip!.folders[0].requests).toHaveLength(1);
    const req = roundTrip!.folders[0].requests[0];
    expect(req.name).toBe("Get User");
    expect(req.method).toBe("GET");
    expect(req.preRequestScript).toContain("pm.setEnv");
    expect(req.testScript).toContain("pm.response.to.have.status(200)");

    expect(req.savedResponses).toBeDefined();
    expect(req.savedResponses).toHaveLength(1);
    expect(req.savedResponses![0].name).toBe("200 OK User");
    expect(req.savedResponses![0].status).toBe(200);
    expect(req.savedResponses![0].body).toBe('{"id":123,"name":"Alice"}');
  });
});
