import { describe, expect, it } from "vitest";
import type { Collection } from "#lib/types";
import { fromOpenApi, toOpenApi, schemaToSample, detectSpecType, inspectSpec } from "./openapi";

describe("OpenAPI / Swagger Engine", () => {
  const sampleOpenApi3Json = JSON.stringify({
    openapi: "3.0.3",
    info: {
      title: "Petstore API",
      version: "1.0.0",
      description: "A sample petstore server",
    },
    servers: [{ url: "https://petstore.example.com/api/v1" }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      schemas: {
        Pet: {
          type: "object",
          required: ["name"],
          properties: {
            id: { type: "integer", example: 101 },
            name: { type: "string", example: "Doggie" },
            status: { type: "string", enum: ["available", "pending", "sold"] },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/pets": {
        get: {
          summary: "List all pets",
          tags: ["Pets"],
          parameters: [
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", default: 20 },
            },
            {
              name: "X-Client-Id",
              in: "header",
              required: true,
              schema: { type: "string" },
              example: "client-abc",
            },
          ],
        },
        post: {
          summary: "Create a pet",
          tags: ["Pets"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Pet" },
              },
            },
          },
        },
      },
      "/pets/{petId}": {
        get: {
          summary: "Get pet by ID",
          tags: ["Pets"],
          parameters: [
            {
              name: "petId",
              in: "path",
              required: true,
              schema: { type: "integer" },
            },
          ],
        },
      },
      "/status": {
        get: {
          summary: "Check API status",
          // no tags -> root collection request
        },
      },
    },
  });

  const sampleSwagger2Json = JSON.stringify({
    swagger: "2.0",
    info: {
      title: "Legacy Swagger Store",
      version: "1.0.0",
    },
    host: "api.legacy.com",
    basePath: "/v2",
    schemes: ["https"],
    securityDefinitions: {
      api_key: {
        type: "apiKey",
        name: "api_key",
        in: "header",
      },
    },
    security: [{ api_key: [] }],
    paths: {
      "/orders": {
        post: {
          summary: "Place an order",
          tags: ["Orders"],
          parameters: [
            {
              name: "body",
              in: "body",
              required: true,
              schema: {
                type: "object",
                properties: {
                  orderId: { type: "integer", example: 456 },
                  quantity: { type: "integer", example: 2 },
                },
              },
            },
          ],
        },
      },
    },
  });

  const sampleYaml = `
openapi: 3.0.0
info:
  title: YAML Petstore
  version: 1.0.0
servers:
  - url: https://yaml.example.com
paths:
  /ping:
    get:
      summary: Ping service
`;

  it("detects OpenAPI 3 and Swagger 2 specifications correctly", () => {
    expect(detectSpecType(JSON.parse(sampleOpenApi3Json))).toEqual({
      valid: true,
      version: "3.0.3",
      type: "openapi",
    });

    expect(detectSpecType(JSON.parse(sampleSwagger2Json))).toEqual({
      valid: true,
      version: "2.0",
      type: "swagger",
    });

    expect(detectSpecType({ foo: "bar" })).toEqual({ valid: false });
  });

  it("imports OpenAPI 3.0 JSON specification", () => {
    const col = fromOpenApi(sampleOpenApi3Json);
    expect(col).not.toBeNull();
    if (!col) return;

    expect(col.name).toBe("Petstore API");
    expect(col.baseUrl).toBe("https://petstore.example.com/api/v1");
    expect(col.auth?.type).toBe("bearer");

    // Tag 'Pets' converted to folder
    expect(col.folders).toHaveLength(1);
    expect(col.folders[0].name).toBe("Pets");
    expect(col.folders[0].requests).toHaveLength(3);

    // Root request for untagged /status
    expect(col.requests).toHaveLength(1);
    expect(col.requests[0].name).toBe("Check API status");
    expect(col.requests[0].url).toBe("/status");

    // Check GET /pets
    const getPets = col.folders[0].requests.find((r) => r.method === "GET" && r.url === "/pets");
    expect(getPets).toBeDefined();
    expect(getPets?.params.some((p) => p.key === "limit")).toBe(true);
    expect(getPets?.headers.some((h) => h.key === "X-Client-Id" && h.value === "client-abc")).toBe(
      true,
    );

    // Check POST /pets with resolved $ref body
    const postPets = col.folders[0].requests.find((r) => r.method === "POST");
    expect(postPets).toBeDefined();
    expect(postPets?.bodyMode).toBe("json");
    const parsedBody = JSON.parse(postPets?.body || "{}");
    expect(parsedBody.id).toBe(101);
    expect(parsedBody.name).toBe("Doggie");

    // Check path parameter normalization: /pets/{petId} -> /pets/{{petId}}
    const getPetById = col.folders[0].requests.find((r) => r.url === "/pets/{{petId}}");
    expect(getPetById).toBeDefined();
  });

  it("imports Swagger 2.0 specification", () => {
    const col = fromOpenApi(sampleSwagger2Json);
    expect(col).not.toBeNull();
    if (!col) return;

    expect(col.name).toBe("Legacy Swagger Store");
    expect(col.baseUrl).toBe("https://api.legacy.com/v2");
    expect(col.auth?.type).toBe("apikey");
    expect(col.auth?.apiKey.key).toBe("api_key");

    expect(col.folders).toHaveLength(1);
    expect(col.folders[0].name).toBe("Orders");
    expect(col.folders[0].requests).toHaveLength(1);

    const postOrder = col.folders[0].requests[0];
    expect(postOrder.method).toBe("POST");
    expect(postOrder.bodyMode).toBe("json");
    const body = JSON.parse(postOrder.body);
    expect(body.orderId).toBe(456);
  });

  it("imports YAML specification seamlessly", () => {
    const col = fromOpenApi(sampleYaml);
    expect(col).not.toBeNull();
    if (!col) return;

    expect(col.name).toBe("YAML Petstore");
    expect(col.baseUrl).toBe("https://yaml.example.com");
    expect(col.requests).toHaveLength(1);
    expect(col.requests[0].name).toBe("Ping service");
    expect(col.requests[0].url).toBe("/ping");
  });

  it("generates sample values from complex schemas and resolvers", () => {
    const doc = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              id: { type: "integer" },
              email: { type: "string", format: "email" },
              tags: { type: "array", items: { type: "string" } },
              active: { type: "boolean" },
            },
          },
        },
      },
    };

    const sample = schemaToSample({ $ref: "#/components/schemas/User" }, doc);
    expect(sample).toEqual({
      id: 0,
      email: "user@example.com",
      tags: ["string"],
      active: true,
    });
  });

  it("exports a RestIO collection to OpenAPI 3.1.0 in JSON and YAML", () => {
    const col: Collection = {
      id: "c1",
      name: "Acme Cloud API",
      baseUrl: "https://api.acme.com",
      auth: {
        type: "bearer",
        bearer: { token: "token" },
        basic: { username: "", password: "" },
        apiKey: { key: "", value: "", addTo: "header" },
      },
      requests: [
        {
          id: "r1",
          name: "Health Check",
          method: "GET",
          url: "/health",
          params: [{ id: "p1", key: "verbose", value: "true", enabled: true }],
          headers: [],
          auth: {
            type: "none",
            bearer: { token: "" },
            basic: { username: "", password: "" },
            apiKey: { key: "", value: "", addTo: "header" },
          },
          bodyMode: "none",
          body: "",
          formFields: [],
          multipart: [],
          binaryPath: "",
        },
      ],
      folders: [
        {
          id: "f1",
          name: "Users",
          urlPrefix: "/v1",
          folders: [],
          requests: [
            {
              id: "r2",
              name: "Create User",
              method: "POST",
              url: "/users/{{id}}",
              params: [],
              headers: [],
              auth: {
                type: "inherit",
                bearer: { token: "" },
                basic: { username: "", password: "" },
                apiKey: { key: "", value: "", addTo: "header" },
              },
              bodyMode: "json",
              body: JSON.stringify({ name: "Bob", role: "developer" }),
              formFields: [],
              multipart: [],
              binaryPath: "",
            },
          ],
        },
      ],
    };

    // JSON export
    const jsonStr = toOpenApi(col, "json");
    const doc = JSON.parse(jsonStr);

    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.title).toBe("Acme Cloud API");
    expect(doc.servers[0].url).toBe("https://api.acme.com");
    expect(doc.paths["/health"].get.summary).toBe("Health Check");
    expect(doc.paths["/health"].get.parameters[0].name).toBe("verbose");
    // Path parameter exported as {id}
    expect(doc.paths["/users/{id}"].post.summary).toBe("Create User");
    expect(doc.paths["/users/{id}"].post.tags).toEqual(["Users"]);
    expect(doc.components.securitySchemes.bearerAuth).toBeDefined();

    // YAML export
    const yamlStr = toOpenApi(col, "yaml");
    expect(yamlStr).toContain("openapi: 3.1.0");
    expect(yamlStr).toContain("title: Acme Cloud API");
    expect(yamlStr).toContain("/users/{id}:");
  });

  it("inspects raw spec text quickly without full parsing", () => {
    // Valid OpenAPI 3
    const info3 = inspectSpec(sampleOpenApi3Json);
    expect(info3.valid).toBe(true);
    expect(info3.type).toBe("openapi");
    expect(info3.version).toBe("3.0.3");
    expect(info3.title).toBe("Petstore API");
    expect(info3.endpointCount).toBe(4);

    // Valid YAML
    const infoYaml = inspectSpec(sampleYaml);
    expect(infoYaml.valid).toBe(true);
    expect(infoYaml.type).toBe("openapi");
    expect(infoYaml.version).toBe("3.0.0");
    expect(infoYaml.title).toBe("YAML Petstore");
    expect(infoYaml.endpointCount).toBe(1);

    // Valid Swagger 2 JSON
    const info2 = inspectSpec(sampleSwagger2Json);
    expect(info2.valid).toBe(true);
    expect(info2.type).toBe("swagger");
    expect(info2.version).toBe("2.0");
    expect(info2.title).toBe("Legacy Swagger Store");
    expect(info2.endpointCount).toBe(1);

    // Invalid spec
    const invalid = inspectSpec('{"hello": "world"}');
    expect(invalid.valid).toBe(false);

    // Malformed syntax
    const malformed = inspectSpec('openapi: "3.0.0"\n  invalid: indent: :');
    expect(malformed.valid).toBe(false);
    expect(malformed.error).toBeDefined();
  });
});
