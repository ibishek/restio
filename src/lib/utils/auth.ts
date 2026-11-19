// Auth materialization for **code export only**. Real sends apply auth in Rust
// (`http::auth`, ARCHITECTURE.md §6); this mirrors that logic so generated code
// snippets (#lib/utils/codegen) include the same header/query the app would send.
// Keep the two in sync. Expects an already-resolved request (values concrete).

import type { RequestAuth } from "#lib/types";

interface Pair {
  key: string;
  value: string;
}

/** Extra headers and query params implied by a request's auth config. */
export function authAdditions(auth: RequestAuth | undefined): { headers: Pair[]; params: Pair[] } {
  const out: { headers: Pair[]; params: Pair[] } = { headers: [], params: [] };
  if (!auth || auth.type === "none") return out;
  if (auth.type === "bearer") {
    if (auth.bearer.token)
      out.headers.push({ key: "Authorization", value: `Bearer ${auth.bearer.token}` });
  } else if (auth.type === "basic") {
    out.headers.push({
      key: "Authorization",
      value: `Basic ${base64(`${auth.basic.username}:${auth.basic.password}`)}`,
    });
  } else if (auth.type === "apikey" && auth.apiKey.key) {
    const row = { key: auth.apiKey.key, value: auth.apiKey.value };
    if (auth.apiKey.addTo === "query") out.params.push(row);
    else out.headers.push(row);
  }
  return out;
}

/** UTF-8-safe base64 (btoa alone throws on multi-byte characters). */
function base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
