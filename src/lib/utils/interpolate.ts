// Environment-variable interpolation. `{{var}}` placeholders are resolved into
// requests HERE, in the frontend, *before* the request crosses IPC to the Rust
// engine (ARCHITECTURE.md §7) — the backend only ever sees concrete values.
//
// Pure and dependency-free so it stays trivially testable and reusable.

import type { Environment, HttpRequest, KeyValue, RequestAuth } from "#lib/types";

/** Matches `{{ name }}` — inner whitespace is trimmed; names allow word chars,
 *  dot, and dash (e.g. `{{ base_url }}`, `{{api.key}}`, `{{x-token}}`). */
const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

/**
 * Build a name→value map from an environment. Only **enabled** rows with a
 * non-empty key contribute; when a name repeats, the last row wins (matches the
 * key/value editor, where a later row overrides an earlier duplicate).
 */
export function buildVarMap(env: Environment | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!env) return map;
  for (const v of env.variables) {
    if (v.enabled && v.key) map.set(v.key, v.value);
  }
  return map;
}

/** Substitute `{{var}}` tokens in `template`. Unknown variables are left
 *  verbatim (so a typo is visible in the sent request, not silently blanked). */
export function interpolate(template: string, vars: Map<string, string>): string {
  if (!template) return template;
  return template.replace(TOKEN, (match, name: string) => vars.get(name) ?? match);
}

/** Extract the distinct variable names referenced by `{{...}}` in `text`. */
export function findVars(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(TOKEN)) names.add(m[1]);
  return [...names];
}

/** One run of a var-highlighted string: plain text (`name` undefined) or a
 *  `{{var}}` token (`name` = the referenced variable). `text` is the verbatim
 *  source slice (including the braces for a token). */
export interface VarSegment {
  text: string;
  name?: string;
}

/** Split `text` into alternating plain runs and `{{var}}` tokens, in order, so
 *  a UI can render each token colored (defined vs undefined). Concatenating the
 *  segment `text`s reproduces the input exactly. Uses the same {@link TOKEN}
 *  grammar as interpolation, so what highlights is exactly what resolves. */
export function splitVars(text: string): VarSegment[] {
  const segs: VarSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ text: text.slice(last, i) });
    segs.push({ text: m[0], name: m[1] });
    last = i + m[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last) });
  return segs;
}

const resolveRow = (row: KeyValue, vars: Map<string, string>): KeyValue => ({
  ...row,
  key: interpolate(row.key, vars),
  value: interpolate(row.value, vars),
});

/** Resolve `{{vars}}` in an auth config's string values (the concrete result is
 *  what the Rust engine materializes — see `http::auth`). */
const resolveAuth = (auth: RequestAuth, vars: Map<string, string>): RequestAuth => ({
  type: auth.type,
  bearer: { token: interpolate(auth.bearer.token, vars) },
  basic: {
    username: interpolate(auth.basic.username, vars),
    password: interpolate(auth.basic.password, vars),
  },
  apiKey: {
    key: interpolate(auth.apiKey.key, vars),
    value: interpolate(auth.apiKey.value, vars),
    addTo: auth.apiKey.addTo,
  },
});

/**
 * Return a copy of `req` with every `{{var}}` in the URL, params, headers, and
 * body resolved against `env`. Does not mutate the input — the editor keeps
 * showing the un-resolved template; only the sent copy is concrete.
 */
export function resolveRequest(req: HttpRequest, env: Environment | null | undefined): HttpRequest {
  const vars = buildVarMap(env);
  if (vars.size === 0) return req;
  return {
    ...req,
    url: interpolate(req.url, vars),
    params: req.params.map((r) => resolveRow(r, vars)),
    headers: req.headers.map((r) => resolveRow(r, vars)),
    body: interpolate(req.body, vars),
    formFields: req.formFields.map((r) => resolveRow(r, vars)),
    // File paths (filePath) are literal and left untouched; only text carries vars.
    multipart: req.multipart.map((f) => ({
      ...f,
      key: interpolate(f.key, vars),
      value: interpolate(f.value, vars),
    })),
    auth: req.auth ? resolveAuth(req.auth, vars) : req.auth,
  };
}

/**
 * Names referenced across a request that the environment does **not** define —
 * surfaced in the UI as an "unresolved variables" hint before sending.
 */
export function unresolvedVars(req: HttpRequest, env: Environment | null | undefined): string[] {
  const vars = buildVarMap(env);
  const referenced = new Set<string>();
  const scan = (s: string) => findVars(s).forEach((n) => referenced.add(n));
  scan(req.url);
  scan(req.body);
  for (const r of [...req.params, ...req.headers, ...req.formFields]) {
    if (r.enabled) {
      scan(r.key);
      scan(r.value);
    }
  }
  for (const f of req.multipart) {
    if (!f.enabled) continue;
    scan(f.key);
    if (f.kind === "text") scan(f.value);
  }
  const a = req.auth;
  if (a && a.type !== "none") {
    if (a.type === "bearer") scan(a.bearer.token);
    else if (a.type === "basic") {
      scan(a.basic.username);
      scan(a.basic.password);
    } else if (a.type === "apikey") {
      scan(a.apiKey.key);
      scan(a.apiKey.value);
    }
  }
  return [...referenced].filter((n) => !vars.has(n));
}
