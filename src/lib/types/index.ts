// Domain types — the single source of truth for shapes that cross the IPC line.
// Rust structs in `src-tauri/src/models/` mirror these (see ARCHITECTURE.md §5).

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** A single editable key/value row (headers, query params, form fields). */
export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyMode = "none" | "json" | "text" | "form" | "multipart" | "binary";

/**
 * One field of a `multipart/form-data` body. Text fields carry a `value`; file
 * fields carry an absolute `filePath` whose bytes are read in Rust at send time
 * — the path is never persisted into shared collections (ARCHITECTURE.md §8).
 */
export interface MultipartField {
  id: string;
  key: string;
  kind: "text" | "file";
  value: string;
  filePath: string;
  enabled: boolean;
}

export type AuthType = "inherit" | "none" | "bearer" | "basic" | "apikey";

/**
 * Request authorization. `{{vars}}` in the values are resolved in the frontend
 * (like everything else, ARCHITECTURE.md §7); the resolved config crosses IPC
 * and is materialized into headers/query by the Rust engine (`http::auth`, §6).
 * Stored with the request — reference secrets as `{{vars}}`, never hard-code
 * them, since collections are shared (§8).
 *
 * `type: "inherit"` (the default for a request, and for folders/collections)
 * means "use the auth of the nearest ancestor folder/collection that sets a
 * concrete one" — Postman-style. It is resolved to a concrete config in the
 * frontend before send/codegen, so `"inherit"` never crosses IPC.
 */
export interface RequestAuth {
  type: AuthType;
  bearer: { token: string };
  basic: { username: string; password: string };
  apiKey: { key: string; value: string; addTo: "header" | "query" };
}

export interface HttpRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  auth: RequestAuth;
  bodyMode: BodyMode;
  /** JSON or raw-text body — used when `bodyMode` is `"json"` or `"text"`. */
  body: string;
  /** `x-www-form-urlencoded` fields — used when `bodyMode` is `"form"`. */
  formFields: KeyValue[];
  /** `multipart/form-data` fields — used when `bodyMode` is `"multipart"`. */
  multipart: MultipartField[];
  /** Absolute path to a file sent as the raw body — used when `bodyMode` is `"binary"`. */
  binaryPath: string;
  /** Advisory flag — marks the request as deprecated (still sendable). */
  deprecated?: boolean;
  /** Allow self-signed or invalid SSL/TLS certificates for local development. */
  dangerAcceptInvalidCerts?: boolean;
  /** Request timeout in milliseconds (overrides the 30s default). */
  timeoutMs?: number;
  /** JavaScript executed before the request is dispatched. */
  preRequestScript?: string;
  /** JavaScript assertions and post-response logic executed after response arrives. */
  testScript?: string;
  /** Saved example responses associated with this request. */
  savedResponses?: SavedResponse[];
}

export interface SavedResponse {
  id: string;
  name: string;
  status: number;
  statusText: string;
  timeMs: number;
  sizeBytes: number;
  headers: Record<string, string>;
  body: string;
  bodyEncoding: "utf8" | "base64" | "file";
  createdAt: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs?: number;
}

export interface ScriptExecutionResult {
  passed: boolean;
  testResults: TestResult[];
  environmentUpdates: Record<string, string>;
  logs: string[];
  error?: string;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  /** Round-trip time in milliseconds. */
  timeMs: number;
  /** Response body size in bytes (of the original, pre-encoding body). */
  sizeBytes: number;
  headers: Record<string, string>;
  /** UTF-8 text, or base64 when `bodyEncoding` is `"base64"` (binary bodies). */
  body: string;
  bodyEncoding: "utf8" | "base64" | "file";
  /** Optional absolute path if the response was offloaded directly to disk. */
  savedPath?: string;
}

export interface RunnerItem {
  id: string;
  request: HttpRequest;
  location: { collectionId: string; folderIds: string[] };
  enabled: boolean;
}

export interface RunnerStepResult {
  stepIndex: number;
  iteration: number;
  requestId: string;
  requestName: string;
  method: HttpMethod;
  url: string;
  status?: number;
  statusText?: string;
  timeMs?: number;
  sizeBytes?: number;
  testResults: TestResult[];
  logs: string[];
  error?: string;
  passed: boolean;
}

export interface RunnerRunConfig {
  iterations: number;
  delayMs: number;
  stopOnFailure: boolean;
  persistVariables: boolean;
  envId: string | null;
}

export interface RunnerSummary {
  containerName: string;
  totalRequests: number;
  completedRequests: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDurationMs: number;
  avgTimeMs: number;
  steps: RunnerStepResult[];
}

/**
 * A folder groups requests (and nested folders) inside a collection. Its
 * `urlPrefix` is prepended to descendant request URLs, the way a backend router
 * nests route groups — see {@link composeUrl}. Empty prefix contributes nothing.
 */
export interface Folder {
  id: string;
  name: string;
  /** Path segment prepended to descendant request URLs (e.g. `/v1`). */
  urlPrefix: string;
  folders: Folder[];
  requests: HttpRequest[];
  /** Advisory flag — marks the folder (and its contents) as deprecated. */
  deprecated?: boolean;
  /** Auth inherited by descendant requests whose auth is `"inherit"`. Defaults
   *  to `"inherit"` (pass through to the parent). */
  auth?: RequestAuth;
}

/**
 * A named tree of saved requests — the unit that gets shared between users.
 * `baseUrl` is prepended to every descendant request URL; when empty (the
 * default), requests carry their own full URLs and nothing is prepended.
 */
export interface Collection {
  id: string;
  name: string;
  /** Base URL prepended to descendant request URLs (e.g. `https://api.example.com`). */
  baseUrl: string;
  folders: Folder[];
  requests: HttpRequest[];
  /** Auth inherited by descendant requests/folders whose auth is `"inherit"`.
   *  Defaults to `"inherit"`, which (having no parent) resolves to no auth. */
  auth?: RequestAuth;
}

/**
 * A named set of variables (`{{base_url}}`, `{{token}}`) resolved into requests
 * at send time (ARCHITECTURE.md §7). Values are **local** — never put resolved
 * environment values into anything shared (ARCHITECTURE.md §8). Variables reuse
 * the {@link KeyValue} row shape: `key` is the variable name, `value` its value.
 */
export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

/**
 * A workspace — the top-level container that scopes a set of collections and
 * environments, and (via Git) its members. Mirrors the Rust `Workspace` struct.
 */
export interface Workspace {
  id: string;
  name: string;
  /** Absolute path of this workspace's collections file. */
  collectionsPath: string;
  /** Id of this workspace's active environment ("" = none). */
  activeEnvId: string;
}

/** A workspace member, derived from the shared collections repo's Git authors. */
export interface Member {
  name: string;
  email: string;
  commits: number;
}

/**
 * Git state of the collections repo, for the sharing UI (ARCHITECTURE.md §8).
 * Mirrors the Rust `GitStatus` struct.
 */
export interface GitStatus {
  /** Absolute path of the repo working directory. */
  path: string;
  isRepo: boolean;
  branch: string;
  hasRemote: boolean;
  remoteUrl: string;
  /** Commits ahead of upstream. */
  ahead: number;
  /** Commits behind upstream. */
  behind: number;
  /** Uncommitted local changes present. */
  dirty: boolean;
  /** Subject of the latest commit (empty on an unborn branch). */
  lastCommit: string;
  /** Unix seconds of the latest commit (0 if none). */
  lastCommitAt: number;
}

/**
 * Outcome of a pull. `diverged` means local and remote both advanced, so a
 * fast-forward is impossible — the user resolves at the file level.
 * Mirrors the Rust `PullOutcome` enum.
 */
export type PullOutcome = "upToDate" | "fastForwarded" | "diverged";

/** Result of a pull: what happened plus the refreshed repo status. */
export interface PullResult {
  outcome: PullOutcome;
  status: GitStatus;
}

/** How to resolve a diverged pull, at the file level. */
export type ResolveStrategy = "remote" | "local";

/**
 * User settings — persisted locally in SQLite as a textual key/value store, so
 * every value is a string; callers parse as needed. Local only, never shared.
 * The map is open-ended; known keys are documented below.
 */
export interface UserSettings {
  /** Absolute path to the collections file (its Git-shareable location). */
  collections_path?: string;
  /** Id of the active environment (empty string = "No environment"). */
  active_env_id?: string;
  [key: string]: string | undefined;
}

/**
 * One entry in the per-user send log (ARCHITECTURE.md §"History"). Local only —
 * never shared. Stores the composed request (with `{{vars}}` un-resolved) so it
 * can be re-opened in the editor, plus a summary of the response it produced.
 */
export interface HistoryEntry {
  id: string;
  /** Epoch milliseconds when the request completed. */
  at: number;
  /** The request as composed in the editor at send time. */
  request: HttpRequest;
  /** Response status, or `null` when the send errored before a response. */
  status: number | null;
  statusText: string;
  timeMs: number;
  sizeBytes: number;
  /** `true` when a response came back (any status), `false` on network error. */
  ok: boolean;
}
