// Postman Collection v2.1 ⇄ our Collection tree. Pure and dependency-free — the
// portable interchange format (ARCHITECTURE.md §8). Export bakes each request's
// full URL (collection base URL + folder prefixes composed in), since Postman
// has no per-folder URL prefix; `{{vars}}` pass through unchanged (Postman uses
// the same `{{var}}` syntax). Import is tolerant of partial/loose input.

import type {
  Collection,
  Folder,
  HttpRequest,
  KeyValue,
  MultipartField,
  RequestAuth,
  SavedResponse,
} from "#lib/types";
import { composeUrl } from "./url";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

const uid = (): string => crypto.randomUUID();
const kv = (key = "", value = "", enabled = true): KeyValue => ({ id: uid(), key, value, enabled });
const defaultAuth = (): RequestAuth => ({
  type: "inherit",
  bearer: { token: "" },
  basic: { username: "", password: "" },
  apiKey: { key: "", value: "", addTo: "header" },
});

// ── Export ───────────────────────────────────────────────────────────────────

interface PmParam {
  key: string;
  value: string;
  disabled?: true;
}
interface PmItem {
  name: string;
  item?: PmItem[];
  request?: Record<string, unknown>;
  response?: unknown[];
  auth?: Record<string, unknown>;
  event?: Record<string, unknown>[];
}
export interface PostmanCollection {
  info: { name: string; schema: string; _postman_id: string };
  item: PmItem[];
  auth?: Record<string, unknown>;
}

/** Convert one of our collections to a Postman v2.1 collection. Folder- and
 *  collection-level auth is emitted so descendants inherit it (Postman-style). */
export function toPostman(collection: Collection): PostmanCollection {
  const out: PostmanCollection = {
    info: { name: collection.name, schema: SCHEMA, _postman_id: uid() },
    item: [
      ...collection.folders.map((f) => folderToItem(f, collection.baseUrl, [])),
      ...collection.requests.map((r) => requestToItem(r, collection.baseUrl, [])),
    ],
  };
  const auth = authToPm(collection.auth);
  if (auth) out.auth = auth;
  return out;
}

function folderToItem(f: Folder, baseUrl: string, prefixes: string[]): PmItem {
  const pfx = [...prefixes, f.urlPrefix];
  const item: PmItem = {
    name: f.name,
    item: [
      ...f.folders.map((sf) => folderToItem(sf, baseUrl, pfx)),
      ...f.requests.map((r) => requestToItem(r, baseUrl, pfx)),
    ],
  };
  const auth = authToPm(f.auth);
  if (auth) item.auth = auth;
  return item;
}

function requestToItem(r: HttpRequest, baseUrl: string, prefixes: string[]): PmItem {
  const fullUrl = composeUrl(baseUrl, prefixes, r.url);
  const request: Record<string, unknown> = {
    method: r.method.toUpperCase(),
    header: r.headers.filter((h) => h.key).map(toPmParam),
    url: toPmUrl(fullUrl, r.params),
  };
  const auth = authToPm(r.auth);
  if (auth) request.auth = auth;
  const body = bodyToPm(r);
  if (body) request.body = body;

  const event: Record<string, unknown>[] = [];
  if (r.preRequestScript && r.preRequestScript.trim()) {
    event.push({
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: r.preRequestScript.split("\n"),
      },
    });
  }
  if (r.testScript && r.testScript.trim()) {
    event.push({
      listen: "test",
      script: {
        type: "text/javascript",
        exec: r.testScript.split("\n"),
      },
    });
  }

  const response = (r.savedResponses ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    originalRequest: request,
    status: s.statusText,
    code: s.status,
    _postman_previewlanguage: (s.headers["content-type"] ?? "").includes("json") ? "json" : "text",
    header: Object.entries(s.headers).map(([key, value]) => ({ key, value })),
    body: s.body,
  }));

  const item: PmItem = { name: r.name, request, response };
  if (event.length) item.event = event;
  return item;
}

const toPmParam = (row: KeyValue): PmParam =>
  row.enabled
    ? { key: row.key, value: row.value }
    : { key: row.key, value: row.value, disabled: true };

function toPmUrl(fullUrl: string, params: KeyValue[]) {
  const withKey = params.filter((p) => p.key);
  const enabled = withKey.filter((p) => p.enabled);
  const cleanUrl = fullUrl.includes("?") ? fullUrl.slice(0, fullUrl.indexOf("?")) : fullUrl;
  const raw =
    enabled.length === 0
      ? cleanUrl
      : `${cleanUrl}?${enabled
          .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
          .join("&")}`;
  return withKey.length ? { raw, query: withKey.map(toPmParam) } : { raw };
}

function bodyToPm(r: HttpRequest): Record<string, unknown> | null {
  switch (r.bodyMode) {
    case "json":
      return r.body ? { mode: "raw", raw: r.body, options: { raw: { language: "json" } } } : null;
    case "text":
      return r.body ? { mode: "raw", raw: r.body, options: { raw: { language: "text" } } } : null;
    case "form":
      return { mode: "urlencoded", urlencoded: r.formFields.filter((f) => f.key).map(toPmParam) };
    case "multipart":
      return { mode: "formdata", formdata: r.multipart.filter((f) => f.key).map(formDataPart) };
    case "binary":
      return r.binaryPath ? { mode: "file", file: { src: r.binaryPath } } : null;
    default:
      return null;
  }
}

function formDataPart(f: MultipartField): Record<string, unknown> {
  const part: Record<string, unknown> =
    f.kind === "file"
      ? { key: f.key, type: "file", src: f.filePath }
      : { key: f.key, type: "text", value: f.value };
  if (!f.enabled) part.disabled = true;
  return part;
}

const pmAuthParam = (key: string, value: string) => ({ key, value, type: "string" });

/** Map our auth to a Postman `auth` object. `"inherit"` → `null` (omit the key
 *  so Postman inherits from the parent); `"none"` → explicit `noauth` (stops
 *  inheritance). Undefined is treated as inherit. */
function authToPm(a: RequestAuth | undefined): Record<string, unknown> | null {
  const p = pmAuthParam;
  switch (a?.type) {
    case "bearer":
      return { type: "bearer", bearer: [p("token", a.bearer.token)] };
    case "basic":
      return {
        type: "basic",
        basic: [p("username", a.basic.username), p("password", a.basic.password)],
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: [p("key", a.apiKey.key), p("value", a.apiKey.value), p("in", a.apiKey.addTo)],
      };
    case "none":
      return { type: "noauth" };
    default:
      return null; // "inherit" / undefined — omit so Postman inherits
  }
}

// ── Import ───────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

/** Parse a Postman v2.1 collection (object or JSON string) into our tree, or
 *  `null` if it doesn't look like a Postman collection. */
export function fromPostman(input: unknown): Collection | null {
  let json: Any;
  if (typeof input === "string") {
    try {
      json = JSON.parse(input);
    } catch {
      return null;
    }
  } else if (input && typeof input === "object") {
    json = input as Any;
  } else {
    return null;
  }
  if (!json.info || !Array.isArray(json.item)) return null;

  const collection: Collection = {
    id: uid(),
    name: String(json.info.name ?? "Imported collection"),
    baseUrl: "",
    folders: [],
    requests: [],
    auth: fromPmAuth(json.auth),
  };
  for (const it of json.item) addItem(it, collection);
  return collection;
}

function addItem(it: Any, container: Collection | Folder): void {
  if (!it || typeof it !== "object") return;
  if (Array.isArray(it.item)) {
    const folder: Folder = {
      id: uid(),
      name: String(it.name ?? "Folder"),
      urlPrefix: "",
      folders: [],
      requests: [],
      auth: fromPmAuth(it.auth),
    };
    for (const sub of it.item) addItem(sub, folder);
    container.folders.push(folder);
  } else if (it.request) {
    container.requests.push(fromPmRequest(it));
  }
}

function fromPmRequest(it: Any): HttpRequest {
  const req: Any = typeof it.request === "object" ? it.request : {};
  const { url, params } = fromPmUrl(req.url);
  const headers = (Array.isArray(req.header) ? req.header : []).map((h: Any) =>
    kv(String(h.key ?? ""), String(h.value ?? ""), !h.disabled),
  );
  const body = fromPmBody(req.body);

  let preRequestScript = "";
  let testScript = "";
  if (Array.isArray(it.event)) {
    for (const ev of it.event) {
      if (!ev || typeof ev !== "object") continue;
      const exec = (ev as Any).script?.exec;
      const scriptText = Array.isArray(exec)
        ? exec.join("\n")
        : typeof exec === "string"
          ? exec
          : "";
      if (ev.listen === "prerequest") {
        preRequestScript = scriptText;
      } else if (ev.listen === "test") {
        testScript = scriptText;
      }
    }
  }

  const savedResponses: SavedResponse[] = [];
  if (Array.isArray(it.response)) {
    for (const res of it.response) {
      if (!res || typeof res !== "object") continue;
      const respObj = res as Any;
      const resHeaders: Record<string, string> = {};
      if (Array.isArray(respObj.header)) {
        for (const h of respObj.header) {
          if (h && typeof h === "object" && h.key) {
            resHeaders[String(h.key).toLowerCase()] = String(h.value ?? "");
          }
        }
      }
      const bodyStr = typeof respObj.body === "string" ? respObj.body : "";
      savedResponses.push({
        id: String(respObj.id || uid()),
        name: String(respObj.name || `${respObj.code || 200} ${respObj.status || "OK"}`).trim(),
        status: Number(respObj.code) || 200,
        statusText: String(respObj.status || "OK"),
        timeMs: Number(respObj.responseTime) || 0,
        sizeBytes: Number(respObj.responseSize) || bodyStr.length,
        headers: resHeaders,
        body: bodyStr,
        bodyEncoding: "utf8",
        createdAt: Date.now(),
      });
    }
  }

  return {
    id: uid(),
    name: String(it.name ?? "Imported request"),
    method: String(req.method ?? "GET").toUpperCase() as HttpRequest["method"],
    url,
    params: [...params, kv()],
    headers: [...headers, kv()],
    auth: fromPmAuth(req.auth),
    bodyMode: body.bodyMode,
    body: body.body,
    formFields: body.formFields.length ? [...body.formFields, kv()] : [kv()],
    multipart: body.multipart.length
      ? body.multipart
      : [{ id: uid(), key: "", kind: "text", value: "", filePath: "", enabled: true }],
    binaryPath: body.binaryPath,
    preRequestScript,
    testScript,
    savedResponses,
  };
}

function fromPmUrl(u: unknown): { url: string; params: KeyValue[] } {
  let raw = "";
  let params: KeyValue[] = [];
  if (typeof u === "string") {
    raw = u;
  } else if (u && typeof u === "object") {
    const obj = u as Any;
    raw = String(obj.raw ?? "");
    if (Array.isArray(obj.query)) {
      params = obj.query.map((q: Any) =>
        kv(String(q.key ?? ""), String(q.value ?? ""), !q.disabled),
      );
    }
  }
  // Strip the query string off the raw URL (params carry it).
  const qi = raw.indexOf("?");
  if (qi !== -1) {
    if (params.length === 0) {
      params = raw
        .slice(qi + 1)
        .split("&")
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf("=");
          return eq === -1
            ? kv(decode(pair), "")
            : kv(decode(pair.slice(0, eq)), decode(pair.slice(eq + 1)));
        });
    }
    raw = raw.slice(0, qi);
  }
  return { url: raw, params };
}

interface ParsedBody {
  bodyMode: HttpRequest["bodyMode"];
  body: string;
  formFields: KeyValue[];
  multipart: HttpRequest["multipart"];
  binaryPath: string;
}

function fromPmBody(b: unknown): ParsedBody {
  const empty: ParsedBody = {
    bodyMode: "none",
    body: "",
    formFields: [],
    multipart: [],
    binaryPath: "",
  };
  if (!b || typeof b !== "object") return empty;
  const body = b as Any;
  switch (body.mode) {
    case "raw": {
      const lang = body.options?.raw?.language;
      return {
        ...empty,
        bodyMode: lang === "json" ? "json" : "text",
        body: String(body.raw ?? ""),
      };
    }
    case "urlencoded":
      return {
        ...empty,
        bodyMode: "form",
        formFields: (Array.isArray(body.urlencoded) ? body.urlencoded : []).map((p: Any) =>
          kv(String(p.key ?? ""), String(p.value ?? ""), !p.disabled),
        ),
      };
    case "formdata":
      return {
        ...empty,
        bodyMode: "multipart",
        multipart: (Array.isArray(body.formdata) ? body.formdata : []).map((p: Any) => ({
          id: uid(),
          key: String(p.key ?? ""),
          kind: p.type === "file" ? "file" : "text",
          value: String(p.value ?? ""),
          filePath: String(p.src ?? ""),
          enabled: !p.disabled,
        })),
      };
    case "file":
      return { ...empty, bodyMode: "binary", binaryPath: String(body.file?.src ?? "") };
    default:
      return empty;
  }
}

function fromPmAuth(a: unknown): RequestAuth {
  const auth = defaultAuth();
  if (!a || typeof a !== "object") return auth;
  const obj = a as Any;
  const get = (arr: unknown, key: string): string =>
    (Array.isArray(arr) ? arr.find((x: Any) => x.key === key)?.value : undefined) ?? "";
  switch (obj.type) {
    case "noauth":
      auth.type = "none"; // explicit "no auth" — stops inheritance
      break;
    case "bearer":
      auth.type = "bearer";
      auth.bearer.token = String(get(obj.bearer, "token"));
      break;
    case "basic":
      auth.type = "basic";
      auth.basic.username = String(get(obj.basic, "username"));
      auth.basic.password = String(get(obj.basic, "password"));
      break;
    case "apikey": {
      auth.type = "apikey";
      auth.apiKey.key = String(get(obj.apikey, "key"));
      auth.apiKey.value = String(get(obj.apikey, "value"));
      const addTo = String(get(obj.apikey, "in"));
      auth.apiKey.addTo = addTo === "query" ? "query" : "header";
      break;
    }
  }
  return auth;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}
