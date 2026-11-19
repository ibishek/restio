// URL composition for the collection tree. A request's effective URL is built
// from its collection's base URL, the URL prefixes of its ancestor folders, and
// its own path — the way backends nest route groups (base + prefixes + route).
// Pure and dependency-free. Composition happens in the frontend before the URL
// crosses IPC (ARCHITECTURE.md §7); the Rust engine only ever sees a final URL.

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Does `url` already carry a scheme (`https://…`)? Such URLs override the base. */
export function isAbsoluteUrl(url: string): boolean {
  return ABSOLUTE.test(url.trim());
}

/**
 * Join a base URL, folder prefixes, and a request path into one URL. Empty
 * segments are skipped and exactly one slash joins each. Special cases keep the
 * pre-folders behavior intact:
 *   - an **absolute** request path (`https://…`) is returned unchanged — an
 *     escape hatch that ignores the base;
 *   - with no base and no prefixes, the path is returned unchanged (today's
 *     default, where each request holds its own full URL).
 * Query/hash on the trailing path segment are preserved.
 */
export function composeUrl(baseUrl: string, prefixes: string[], path: string): string {
  if (isAbsoluteUrl(path)) return path;
  const baseSegments = [baseUrl, ...prefixes].map((s) => s.trim()).filter((s) => s !== "");
  if (baseSegments.length === 0) return path;
  const trimmedPath = path.trim();
  const allSegments = trimmedPath ? [...baseSegments, trimmedPath] : baseSegments;
  return allSegments.reduce((acc, seg) => `${acc.replace(/\/+$/, "")}/${seg.replace(/^\/+/, "")}`);
}
