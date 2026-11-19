// Query string parsing, serialization, and URL synchronization utilities.

import type { KeyValue } from "#lib/types";

/**
 * Splits a URL into its path portion (scheme, host, path) and query string.
 * Query string does not include the leading `?`.
 */
export function splitUrl(url: string): { path: string; query: string } {
  const qi = url.indexOf("?");
  if (qi === -1) return { path: url, query: "" };
  return { path: url.slice(0, qi), query: url.slice(qi + 1) };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

/**
 * Parses a query string into key-value pairs.
 * Valueless params (e.g. `?flag`) produce `{ key: "flag", value: "" }`.
 */
export function parseQueryString(query: string): { key: string; value: string }[] {
  if (!query) return [];
  return query
    .split("&")
    .filter((part) => part.length > 0)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq === -1) {
        return { key: safeDecode(part), value: "" };
      }
      return {
        key: safeDecode(part.slice(0, eq)),
        value: safeDecode(part.slice(eq + 1)),
      };
    });
}

/**
 * Builds a query string from enabled key-value rows.
 * Only rows with non-empty key or value are included.
 */
export function buildQueryString(
  params: { key: string; value: string; enabled?: boolean }[],
): string {
  const active = params.filter(
    (p) => p.enabled !== false && (p.key.trim() !== "" || p.value.trim() !== ""),
  );
  if (active.length === 0) return "";
  return active
    .map((p) => {
      if (!p.value) return p.key;
      return `${p.key}=${p.value}`;
    })
    .join("&");
}

/**
 * Replaces or appends the query string in `url` with the enabled params.
 */
export function mergeUrlWithParams(
  url: string,
  params: { key: string; value: string; enabled?: boolean }[],
): string {
  const { path } = splitUrl(url);
  const qs = buildQueryString(params);
  return qs ? `${path}?${qs}` : path;
}

export const uid = () => crypto.randomUUID();

/**
 * Synchronize the query parameters in a URL into a KeyValue list.
 * Preserves disabled rows so toggled-off parameters aren't lost when typing.
 */
export function syncParamsFromUrl(
  url: string,
  currentParams: KeyValue[],
  makeId: () => string = uid,
): KeyValue[] {
  const { query } = splitUrl(url);
  const parsed = parseQueryString(query);

  const enabledRows = currentParams.filter(
    (p) => p.enabled && (p.key.trim() !== "" || p.value.trim() !== ""),
  );
  const disabledRows = currentParams.filter((p) => !p.enabled);

  // Check if enabled rows already match the parsed query exactly
  const matches =
    enabledRows.length === parsed.length &&
    enabledRows.every((r, i) => r.key === parsed[i].key && r.value === parsed[i].value);

  if (matches) {
    return currentParams;
  }

  // Build new enabled rows, preserving existing IDs where possible
  const newEnabled: KeyValue[] = parsed.map((p, i) => ({
    id: enabledRows[i]?.id ?? makeId(),
    key: p.key,
    value: p.value,
    enabled: true,
  }));

  // Recombine with disabled rows, followed by a trailing empty row
  return [...newEnabled, ...disabledRows, { id: makeId(), key: "", value: "", enabled: true }];
}
