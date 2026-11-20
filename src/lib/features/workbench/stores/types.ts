// Type definitions and item generators for workbench state.

import type {
  BodyMode,
  Collection,
  Folder,
  HttpMethod,
  HttpRequest,
  HttpResponse,
  KeyValue,
  MultipartField,
  RequestAuth,
  SavedResponse,
  TestResult,
} from "#lib/types";

/** Where a request lives in the collection tree — used to resolve its base URL
 *  and ancestor folder prefixes. `folderIds` is the chain from the collection
 *  root down to (and including) the containing folder; empty = collection root. */
export interface RequestLocation {
  collectionId: string;
  folderIds: string[];
}

export type ReqTab = "params" | "headers" | "body" | "auth" | "scripts" | "settings";
export type ResTab = "body" | "headers" | "timing" | "tests";

/** One open request tab. Everything that used to be a single "open document"
 *  now lives per-tab, so requests (and their in-flight sends) are independent. */
export interface Tab {
  id: string;
  /** "request" edits an HTTP request; "container" edits a folder/collection's
   *  settings (name, base URL/prefix, auth). Defaults to "request". */
  kind: "request" | "container";
  request: HttpRequest;
  /** Tree location of the request, for base-URL/prefix + auth composition. */
  requestLocation: RequestLocation | null;
  /** For kind==="container": the folder/collection being edited. */
  containerLoc: RequestLocation | null;
  response: HttpResponse | null;
  sending: boolean;
  error: string | null;
  currentRunId: string | null;
  cancelled: boolean;
  reqTab: ReqTab;
  resTab: ResTab;
  testResults: TestResult[];
  scriptLogs: string[];
  /** When set, the response viewer displays this saved example response instead of live response. */
  activeExampleId: string | null;
}

/** A pending confirmation prompt (unsaved-changes guard). `onConfirm` is the
 *  primary action; `onDiscard` (if present) is a middle "don't save" option. */
export interface Confirm {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  discardLabel?: string;
  onDiscard?: () => void;
}

export const uid = () => crypto.randomUUID();

export const kv = (key = "", value = "", enabled = true): KeyValue => ({
  id: uid(),
  key,
  value,
  enabled,
});

export const mp = (kind: "text" | "file" = "text"): MultipartField => ({
  id: uid(),
  key: "",
  kind,
  value: "",
  filePath: "",
  enabled: true,
});

export const authFields = () => ({
  bearer: { token: "" },
  basic: { username: "", password: "" },
  apiKey: { key: "", value: "", addTo: "header" as const },
});

/** A request/folder/collection's default auth: inherit from its parent
 *  (Postman-style). Also used to backfill data saved before auth existed. */
export const defaultAuth = (): RequestAuth => ({ type: "inherit", ...authFields() });
export const noneAuth = (): RequestAuth => ({ type: "none", ...authFields() });

/** Headers a fresh request starts with. JSON is the common case for this kind of
 *  tool; either row can be toggled off or removed. (We do NOT inherit headers
 *  from folders — only auth + urlPrefix flow down the tree.) */
export const defaultHeaders = (): KeyValue[] => [
  kv("Content-Type", "application/json"),
  kv("Accept", "application/json"),
];

/** Content-Length is computed from the body by the HTTP client; a value carried
 *  in from an import/paste goes stale on the next edit and breaks the request.
 *  Drop it wherever external headers enter (curl paste, Postman/collection load). */
export const isContentLength = (key: string) => key.trim().toLowerCase() === "content-length";

export function makeRequest(
  name: string,
  method: HttpMethod,
  url: string,
  opts: {
    bodyMode?: BodyMode;
    body?: string;
    headers?: KeyValue[];
    preRequestScript?: string;
    testScript?: string;
    savedResponses?: SavedResponse[];
  } = {},
): HttpRequest {
  return {
    id: uid(),
    name,
    method,
    url,
    params: [kv()],
    headers: [...(opts.headers ?? defaultHeaders()), kv()],
    auth: defaultAuth(),
    bodyMode: opts.bodyMode ?? "none",
    body: opts.body ?? "",
    formFields: [kv()],
    multipart: [mp()],
    binaryPath: "",
    dangerAcceptInvalidCerts: false,
    timeoutMs: undefined,
    preRequestScript: opts.preRequestScript ?? "",
    testScript: opts.testScript ?? "",
    savedResponses: opts.savedResponses ?? [],
  };
}

/** Backfill body fields added after a request was first saved, so requests
 *  loaded from older collections/history don't have `undefined` arrays the UI
 *  would choke on. Leaves a trailing blank row to type into. */
export function normalizeRequest(req: HttpRequest): HttpRequest {
  const headers = (req.headers ?? []).filter((h) => !isContentLength(h.key));
  return {
    ...req,
    headers: headers.length ? headers : [kv()],
    auth: req.auth ? { ...defaultAuth(), ...req.auth } : defaultAuth(),
    formFields: req.formFields?.length ? req.formFields : [kv()],
    multipart: req.multipart?.length ? req.multipart : [mp()],
    binaryPath: req.binaryPath ?? "",
    dangerAcceptInvalidCerts: req.dangerAcceptInvalidCerts ?? false,
    timeoutMs: req.timeoutMs,
    preRequestScript: req.preRequestScript ?? "",
    testScript: req.testScript ?? "",
    savedResponses: req.savedResponses ?? [],
  };
}

/** Backfill fields added after a collection was first saved (older on-disk data
 *  is the flat `{id,name,requests}` shape) and normalize every nested request. */
export function normalizeFolder(f: Folder): Folder {
  return {
    ...f,
    id: f.id,
    name: f.name,
    urlPrefix: f.urlPrefix ?? "",
    auth: f.auth ? { ...defaultAuth(), ...f.auth } : defaultAuth(),
    folders: (f.folders ?? []).map(normalizeFolder),
    requests: (f.requests ?? []).map(normalizeRequest),
  };
}

export function normalizeCollection(c: Collection): Collection {
  return {
    ...c,
    id: c.id,
    name: c.name,
    baseUrl: c.baseUrl ?? "",
    auth: c.auth ? { ...defaultAuth(), ...c.auth } : defaultAuth(),
    folders: (c.folders ?? []).map(normalizeFolder),
    requests: (c.requests ?? []).map(normalizeRequest),
  };
}

export const normalizeCollections = (cols: Collection[]): Collection[] =>
  cols.map(normalizeCollection);

/** Do two locations point at the same node? */
export function sameLoc(a: RequestLocation, b: RequestLocation): boolean {
  return (
    a.collectionId === b.collectionId &&
    a.folderIds.length === b.folderIds.length &&
    a.folderIds.every((id, i) => id === b.folderIds[i])
  );
}

function cloneRequest(req: HttpRequest): HttpRequest {
  return JSON.parse(JSON.stringify(req)) as HttpRequest;
}

/** A fresh tab wrapping `request` (deep-copied) at `location`. */
export function makeTab(request: HttpRequest, location: RequestLocation | null): Tab {
  return {
    id: uid(),
    kind: "request",
    request: normalizeRequest(cloneRequest(request)),
    requestLocation: location,
    containerLoc: null,
    response: null,
    sending: false,
    error: null,
    currentRunId: null,
    cancelled: false,
    reqTab: "params",
    resTab: "body",
    testResults: [],
    scriptLogs: [],
    activeExampleId: null,
  };
}
