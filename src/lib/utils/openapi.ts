// OpenAPI 3.0, 3.1, and Swagger 2.0 import and export engine.

import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  Collection,
  Folder,
  HttpMethod,
  HttpRequest,
  KeyValue,
  MultipartField,
  RequestAuth,
} from "#lib/types";
import { defaultAuth, kv, makeRequest, mp, uid } from "#lib/features/workbench/stores/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenApiDoc = any;

/**
 * Generate a sample JavaScript value from an OpenAPI / JSON Schema definition.
 * Handles primitive types, objects, arrays, example values, and $ref lookups.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function schemaToSample(
  schema: any,
  rootDoc?: OpenApiDoc,
  visited = new Set<string>(),
): any {
  if (!schema || typeof schema !== "object") return "";

  // 1. Direct examples take precedence
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;

  // 2. Resolve $ref
  if (typeof schema.$ref === "string") {
    const ref = schema.$ref as string;
    if (visited.has(ref)) return {};
    visited.add(ref);

    const resolved = resolveRef(ref, rootDoc);
    if (resolved) {
      return schemaToSample(resolved, rootDoc, visited);
    }
    return {};
  }

  // 3. Handle schema combinators: anyOf, oneOf, allOf
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return schemaToSample(schema.oneOf[0], rootDoc, visited);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return schemaToSample(schema.anyOf[0], rootDoc, visited);
  }
  if (Array.isArray(schema.allOf)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: Record<string, any> = {};
    for (const part of schema.allOf) {
      const sample = schemaToSample(part, rootDoc, visited);
      if (sample && typeof sample === "object" && !Array.isArray(sample)) {
        Object.assign(merged, sample);
      }
    }
    return merged;
  }

  const type = schema.type || (schema.properties ? "object" : "string");

  // 4. Object type
  if (type === "object" || schema.properties) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: Record<string, any> = {};
    const props = schema.properties || {};
    for (const [key, propSchema] of Object.entries(props)) {
      obj[key] = schemaToSample(propSchema, rootDoc, new Set(visited));
    }
    return obj;
  }

  // 5. Array type
  if (type === "array") {
    if (schema.items) {
      return [schemaToSample(schema.items, rootDoc, new Set(visited))];
    }
    return [];
  }

  // 6. Primitive types
  if (type === "integer" || type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return true;
  }
  if (type === "string") {
    if (schema.format === "date-time") return new Date().toISOString();
    if (schema.format === "date") return new Date().toISOString().slice(0, 10);
    if (schema.format === "email") return "user@example.com";
    if (schema.format === "uuid") return "123e4567-e89b-12d3-a456-426614174000";
    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
      return schema.enum[0];
    }
    return "string";
  }

  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveRef(ref: string, rootDoc?: OpenApiDoc): any {
  if (!rootDoc || !ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = rootDoc;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return current;
}

/**
 * Detect the specification type and version from parsed document object.
 */
export function detectSpecType(doc: OpenApiDoc): {
  valid: boolean;
  version?: string;
  type?: "openapi" | "swagger";
} {
  if (!doc || typeof doc !== "object") return { valid: false };

  if (typeof doc.openapi === "string") {
    return { valid: true, version: doc.openapi, type: "openapi" };
  }
  if (doc.swagger === "2.0") {
    return { valid: true, version: "2.0", type: "swagger" };
  }

  return { valid: false };
}

/**
 * Inspect raw specification text (JSON or YAML) without full conversion.
 * Returns metadata such as validity, version, endpoint count, and API title.
 */
export function inspectSpec(content: string): {
  valid: boolean;
  type?: "openapi" | "swagger";
  version?: string;
  title?: string;
  endpointCount?: number;
  error?: string;
} {
  if (!content || !content.trim()) return { valid: false };

  try {
    const doc = parseYaml(content);
    const detection = detectSpecType(doc);
    if (!detection.valid) {
      return { valid: false, error: "Not an OpenAPI or Swagger specification." };
    }

    let endpointCount = 0;
    if (doc.paths && typeof doc.paths === "object") {
      const httpMethods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
      for (const item of Object.values(doc.paths)) {
        if (item && typeof item === "object") {
          for (const m of httpMethods) {
            if (m in (item as Record<string, unknown>)) endpointCount++;
          }
        }
      }
    }

    return {
      valid: true,
      type: detection.type,
      version: detection.version,
      title: doc.info?.title || "Untitled API",
      endpointCount,
    };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Parse an OpenAPI 3.x or Swagger 2.0 specification text (JSON or YAML)
 * into a RestIO `Collection`.
 */
export function fromOpenApi(content: string): Collection | null {
  if (!content || !content.trim()) return null;

  let doc: OpenApiDoc;
  try {
    // parseYaml parses both JSON and YAML seamlessly
    doc = parseYaml(content);
  } catch {
    return null;
  }

  const detection = detectSpecType(doc);
  if (!detection.valid) return null;

  const isSwagger = detection.type === "swagger";

  // 1. Collection metadata & Base URL
  const colName = doc.info?.title ? String(doc.info.title).trim() : "Imported API";
  let baseUrl = "";

  if (isSwagger) {
    const scheme = Array.isArray(doc.schemes) && doc.schemes.length > 0 ? doc.schemes[0] : "https";
    const host = doc.host ? String(doc.host).trim() : "";
    const basePath = doc.basePath ? String(doc.basePath).trim() : "";
    if (host) {
      baseUrl = `${scheme}://${host}${basePath}`.replace(/\/+$/, "");
    } else if (basePath && basePath !== "/") {
      baseUrl = basePath;
    }
  } else if (Array.isArray(doc.servers) && doc.servers.length > 0 && doc.servers[0]?.url) {
    baseUrl = String(doc.servers[0].url).trim().replace(/\/+$/, "");
  }

  // 2. Security schemes to default auth mapping
  let defaultColAuth: RequestAuth = defaultAuth();
  const secSchemes = isSwagger
    ? doc.securityDefinitions || {}
    : doc.components?.securitySchemes || {};

  // Check top-level security requirements
  if (Array.isArray(doc.security) && doc.security.length > 0) {
    const firstSec = doc.security[0];
    const secKey = Object.keys(firstSec)[0];
    if (secKey && secSchemes[secKey]) {
      const scheme = secSchemes[secKey];
      defaultColAuth = convertSecuritySchemeToAuth(scheme, isSwagger);
    }
  }

  const foldersByTag = new Map<string, Folder>();
  const rootRequests: HttpRequest[] = [];

  // Initialize folders for explicitly listed tags in info
  if (Array.isArray(doc.tags)) {
    for (const tag of doc.tags) {
      if (tag && tag.name) {
        const tagName = String(tag.name).trim();
        if (!foldersByTag.has(tagName)) {
          foldersByTag.set(tagName, {
            id: uid(),
            name: tagName,
            urlPrefix: "",
            folders: [],
            requests: [],
            auth: defaultAuth(),
          });
        }
      }
    }
  }

  const pathsObj = doc.paths || {};
  const HTTP_METHODS = new Set<string>([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]);

  for (const [rawPath, pathItem] of Object.entries(pathsObj)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    // Convert OpenAPI path parameter syntax /users/{id} to RestIO template syntax /users/{{id}}
    const normalizedPath = rawPath.replace(/\{([^{}]+)\}/g, "{{$1}}");

    // Path-level parameters
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pathLevelParams: any[] = Array.isArray((pathItem as any).parameters)
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pathItem as any).parameters
      : [];

    for (const [methodKey, operation] of Object.entries(pathItem)) {
      const upperMethod = methodKey.toUpperCase() as HttpMethod;
      if (!HTTP_METHODS.has(upperMethod)) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const op = operation as any;
      if (!op || typeof op !== "object") continue;

      // Request name
      const name = op.summary
        ? String(op.summary).trim()
        : op.operationId
          ? String(op.operationId).trim()
          : `${upperMethod} ${rawPath}`;

      // Query params and headers
      const queryParams: KeyValue[] = [];
      const headers: KeyValue[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opParams: any[] = Array.isArray(op.parameters) ? op.parameters : [];
      const combinedParams = [...pathLevelParams, ...opParams];

      let bodyMode: HttpRequest["bodyMode"] = "none";
      let bodyText = "";
      const formFields: KeyValue[] = [];
      const multipartFields: MultipartField[] = [];

      for (const p of combinedParams) {
        if (!p || typeof p !== "object") continue;
        const pName = p.name ? String(p.name).trim() : "";
        if (!pName) continue;

        const val =
          p.example !== undefined
            ? String(p.example)
            : p.schema
              ? String(schemaToSample(p.schema, doc))
              : p.default !== undefined
                ? String(p.default)
                : "";

        if (p.in === "query") {
          queryParams.push({
            id: uid(),
            key: pName,
            value: val,
            enabled: p.required ?? true,
          });
        } else if (p.in === "header") {
          headers.push({
            id: uid(),
            key: pName,
            value: val,
            enabled: p.required ?? true,
          });
        } else if (isSwagger && p.in === "body" && p.schema) {
          // Swagger 2.0 body param
          bodyMode = "json";
          const sample = schemaToSample(p.schema, doc);
          bodyText = JSON.stringify(sample, null, 2);
          headers.push(kv("Content-Type", "application/json"));
        } else if (isSwagger && p.in === "formData") {
          if (p.type === "file") {
            bodyMode = "multipart";
            multipartFields.push(mp("file"));
          } else {
            if (bodyMode !== "multipart") bodyMode = "form";
            formFields.push({
              id: uid(),
              key: pName,
              value: val,
              enabled: true,
            });
          }
        }
      }

      // OpenAPI 3.x requestBody
      if (!isSwagger && op.requestBody?.content) {
        const bodyContent = op.requestBody.content;
        if (bodyContent["application/json"]) {
          bodyMode = "json";
          const jsonSchema = bodyContent["application/json"].schema;
          const sample = schemaToSample(jsonSchema, doc);
          bodyText = JSON.stringify(sample, null, 2);
          if (!headers.some((h) => h.key.toLowerCase() === "content-type")) {
            headers.push(kv("Content-Type", "application/json"));
          }
        } else if (bodyContent["application/x-www-form-urlencoded"]) {
          bodyMode = "form";
          const formSchema = bodyContent["application/x-www-form-urlencoded"].schema;
          if (formSchema?.properties) {
            for (const [key, prop] of Object.entries(formSchema.properties)) {
              formFields.push({
                id: uid(),
                key,
                value: String(schemaToSample(prop, doc)),
                enabled: true,
              });
            }
          }
        } else if (bodyContent["multipart/form-data"]) {
          bodyMode = "multipart";
          const multiSchema = bodyContent["multipart/form-data"].schema;
          if (multiSchema?.properties) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const [key, prop] of Object.entries(multiSchema.properties) as [string, any][]) {
              const isFile =
                prop.type === "string" && (prop.format === "binary" || prop.format === "base64");
              const field = mp(isFile ? "file" : "text");
              field.key = key;
              field.value = isFile ? "" : String(schemaToSample(prop, doc));
              multipartFields.push(field);
            }
          }
        } else {
          // Other text body
          const firstType = Object.keys(bodyContent)[0];
          if (firstType) {
            bodyMode = "text";
            const sample = schemaToSample(bodyContent[firstType]?.schema, doc);
            bodyText = typeof sample === "string" ? sample : JSON.stringify(sample, null, 2);
            headers.push(kv("Content-Type", firstType));
          }
        }
      }

      // Ensure trailing blanks for table inputs
      queryParams.push(kv());
      headers.push(kv());
      if (formFields.length === 0) formFields.push(kv());
      if (multipartFields.length === 0) multipartFields.push(mp());

      // Operation-specific security
      let reqAuth: RequestAuth = defaultAuth();
      if (Array.isArray(op.security) && op.security.length > 0) {
        const firstOpSec = op.security[0];
        const secKey = Object.keys(firstOpSec)[0];
        if (secKey && secSchemes[secKey]) {
          reqAuth = convertSecuritySchemeToAuth(secSchemes[secKey], isSwagger);
        }
      }

      const requestItem: HttpRequest = {
        ...makeRequest(name, upperMethod, normalizedPath, {
          bodyMode,
          body: bodyText,
          headers,
        }),
        params: queryParams,
        formFields,
        multipart: multipartFields,
        auth: reqAuth,
        deprecated: op.deprecated ?? false,
      };

      // Folder tagging: place under tag folder if tags present, else root
      const tag = Array.isArray(op.tags) && op.tags.length > 0 ? String(op.tags[0]).trim() : "";
      if (tag) {
        let folder = foldersByTag.get(tag);
        if (!folder) {
          folder = {
            id: uid(),
            name: tag,
            urlPrefix: "",
            folders: [],
            requests: [],
            auth: defaultAuth(),
          };
          foldersByTag.set(tag, folder);
        }
        folder.requests.push(requestItem);
      } else {
        rootRequests.push(requestItem);
      }
    }
  }

  // Filter out empty tag folders that have neither subfolders nor requests
  const folders = Array.from(foldersByTag.values()).filter(
    (f) => f.requests.length > 0 || f.folders.length > 0,
  );

  return {
    id: uid(),
    name: colName,
    baseUrl,
    auth: defaultColAuth,
    folders,
    requests: rootRequests,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertSecuritySchemeToAuth(scheme: any, isSwagger = false): RequestAuth {
  const auth = defaultAuth();
  if (!scheme || typeof scheme !== "object") return auth;

  if (isSwagger) {
    if (scheme.type === "basic") {
      auth.type = "basic";
    } else if (scheme.type === "apiKey") {
      auth.type = "apikey";
      auth.apiKey = {
        key: scheme.name || "X-API-Key",
        value: "",
        addTo: scheme.in === "query" ? "query" : "header",
      };
    }
  } else {
    // OpenAPI 3.x
    const type = scheme.type;
    if (type === "http") {
      const schemeName = (scheme.scheme || "").toLowerCase();
      if (schemeName === "bearer") {
        auth.type = "bearer";
      } else if (schemeName === "basic") {
        auth.type = "basic";
      }
    } else if (type === "apiKey") {
      auth.type = "apikey";
      auth.apiKey = {
        key: scheme.name || "X-API-Key",
        value: "",
        addTo: scheme.in === "query" ? "query" : "header",
      };
    }
  }

  return auth;
}

/**
 * Export a RestIO `Collection` to an OpenAPI 3.1.0 document.
 * Returns either a formatted JSON string or YAML string.
 */
export function toOpenApi(collection: Collection, format: "json" | "yaml" = "json"): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paths: Record<string, Record<string, any>> = {};
  const tagsSet = new Set<string>();

  // Walk request tree
  function processRequests(requests: HttpRequest[], tagName?: string) {
    for (const req of requests) {
      if (tagName) tagsSet.add(tagName);

      // Normalize path for OpenAPI e.g. /users/{{id}} -> /users/{id}
      let rawPath = req.url.trim();
      // Remove query string if present
      const qIdx = rawPath.indexOf("?");
      if (qIdx !== -1) rawPath = rawPath.slice(0, qIdx);
      if (!rawPath.startsWith("/")) rawPath = "/" + rawPath;
      const openApiPath = rawPath.replace(/\{\{([^{}]+)\}\}/g, "{$1}");

      const method = req.method.toLowerCase();
      if (!paths[openApiPath]) paths[openApiPath] = {};

      // Parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parameters: any[] = [];

      for (const p of req.params) {
        if (!p.key.trim()) continue;
        parameters.push({
          name: p.key.trim(),
          in: "query",
          required: p.enabled,
          schema: { type: "string" },
          example: p.value || undefined,
        });
      }

      for (const h of req.headers) {
        if (!h.key.trim() || h.key.toLowerCase() === "content-type") continue;
        parameters.push({
          name: h.key.trim(),
          in: "header",
          required: h.enabled,
          schema: { type: "string" },
          example: h.value || undefined,
        });
      }

      // Request Body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let requestBody: any = undefined;
      if (req.bodyMode === "json" && req.body.trim()) {
        try {
          const parsed = JSON.parse(req.body);
          requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
                example: parsed,
              },
            },
          };
        } catch {
          requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: { type: "string" },
                example: req.body,
              },
            },
          };
        }
      } else if (req.bodyMode === "form" && req.formFields.some((f) => f.key.trim())) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props: Record<string, any> = {};
        for (const f of req.formFields) {
          if (f.key.trim()) {
            props[f.key.trim()] = { type: "string", example: f.value };
          }
        }
        requestBody = {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: { type: "object", properties: props },
            },
          },
        };
      } else if (req.bodyMode === "multipart" && req.multipart.some((f) => f.key.trim())) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props: Record<string, any> = {};
        for (const f of req.multipart) {
          if (f.key.trim()) {
            props[f.key.trim()] =
              f.kind === "file"
                ? { type: "string", format: "binary" }
                : { type: "string", example: f.value };
          }
        }
        requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { type: "object", properties: props },
            },
          },
        };
      }

      paths[openApiPath][method] = {
        summary: req.name || `${req.method} ${openApiPath}`,
        tags: tagName ? [tagName] : undefined,
        parameters: parameters.length > 0 ? parameters : undefined,
        requestBody,
        deprecated: req.deprecated ? true : undefined,
        responses: {
          "200": {
            description: "Successful response",
          },
        },
      };
    }
  }

  processRequests(collection.requests);

  function walkFolders(folders: Folder[]) {
    for (const folder of folders) {
      processRequests(folder.requests, folder.name);
      if (folder.folders.length > 0) walkFolders(folder.folders);
    }
  }

  walkFolders(collection.folders);

  // Security schemes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const securitySchemes: Record<string, any> = {};
  if (collection.auth && collection.auth.type !== "none" && collection.auth.type !== "inherit") {
    if (collection.auth.type === "bearer") {
      securitySchemes["bearerAuth"] = {
        type: "http",
        scheme: "bearer",
      };
    } else if (collection.auth.type === "basic") {
      securitySchemes["basicAuth"] = {
        type: "http",
        scheme: "basic",
      };
    } else if (collection.auth.type === "apikey") {
      securitySchemes["apiKeyAuth"] = {
        type: "apiKey",
        name: collection.auth.apiKey.key || "X-API-Key",
        in: collection.auth.apiKey.addTo,
      };
    }
  }

  const doc = {
    openapi: "3.1.0",
    info: {
      title: collection.name || "RestIO Collection",
      version: "1.0.0",
    },
    servers: collection.baseUrl ? [{ url: collection.baseUrl }] : [],
    tags: Array.from(tagsSet).map((name) => ({ name })),
    paths,
    components: Object.keys(securitySchemes).length > 0 ? { securitySchemes } : undefined,
  };

  return format === "yaml" ? stringifyYaml(doc) : JSON.stringify(doc, null, 2);
}
