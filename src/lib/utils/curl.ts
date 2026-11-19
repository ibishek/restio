// cURL command → request parser. Pure and dependency-free so it stays trivially
// testable. Handles the flags people actually paste (browser "Copy as cURL",
// docs, terminals): the URL, -X/--request, -H/--header, -d/--data* /
// --data-urlencode, -F/--form, -G, -u, -A/-b/-e, and the boolean noise
// (-s -L -k -v --compressed …). Produces an **id-free** description; the state
// layer turns it into a live HttpRequest (ids, trailing blank rows).

import type { BodyMode } from "#lib/types";

interface Pair {
  key: string;
  value: string;
}

interface ParsedMultipart {
  key: string;
  kind: "text" | "file";
  value: string;
  filePath: string;
}

export interface ParsedCurl {
  name: string;
  method: string;
  url: string;
  params: Pair[];
  headers: Pair[];
  bodyMode: BodyMode;
  body: string;
  formFields: Pair[];
  multipart: ParsedMultipart[];
  binaryPath: string;
}

/** Does this text look like a cURL command? (Tolerates a leading `$ ` prompt.) */
export function isCurlCommand(text: string): boolean {
  return /^\s*curl\b/i.test(text.replace(/^\s*\$\s+/, ""));
}

/**
 * Split a shell command into tokens, honoring single quotes, double quotes,
 * `$'…'` ANSI-C quoting, backslash escapes, and adjacent-part concatenation
 * (`-d'x'` → one token `-dx`). Backslash/caret line-continuations are folded to
 * spaces first.
 */
function tokenize(input: string): string[] {
  const src = input.replace(/\\\r?\n/g, " ").replace(/\^\r?\n/g, " ");
  const tokens: string[] = [];
  const n = src.length;
  let cur = "";
  let inToken = false;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (!inToken) {
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      inToken = true;
      cur = "";
    }
    if (/\s/.test(c)) {
      tokens.push(cur);
      inToken = false;
      i++;
      continue;
    }
    if (c === "'") {
      i++;
      while (i < n && src[i] !== "'") cur += src[i++];
      i++; // closing quote
    } else if (c === '"') {
      i++;
      while (i < n && src[i] !== '"') {
        if (src[i] === "\\" && i + 1 < n && ['"', "\\", "$", "`"].includes(src[i + 1])) {
          cur += src[i + 1];
          i += 2;
        } else {
          cur += src[i++];
        }
      }
      i++;
    } else if (c === "$" && src[i + 1] === "'") {
      i += 2;
      const esc: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        "\\": "\\",
        "'": "'",
        '"': '"',
      };
      while (i < n && src[i] !== "'") {
        if (src[i] === "\\" && i + 1 < n) {
          cur += esc[src[i + 1]] ?? src[i + 1];
          i += 2;
        } else {
          cur += src[i++];
        }
      }
      i++;
    } else if (c === "\\") {
      if (i + 1 < n) {
        cur += src[i + 1];
        i += 2;
      } else {
        i++;
      }
    } else {
      cur += c;
      i++;
    }
  }
  if (inToken) tokens.push(cur);
  return tokens;
}

// Short flags that take a value. `_ignore` = consume the value but drop it (so a
// flag like `-m 30` doesn't leave `30` to be mistaken for the URL).
const SHORT_VALUE_FLAGS: Record<string, string> = {
  X: "request",
  H: "header",
  d: "data",
  F: "form",
  u: "user",
  A: "user-agent",
  b: "cookie",
  e: "referer",
  o: "_ignore",
  m: "_ignore",
  x: "_ignore",
  c: "_ignore",
  w: "_ignore",
  D: "_ignore",
  T: "_ignore",
  y: "_ignore",
  Y: "_ignore",
  z: "_ignore",
  K: "_ignore",
  C: "_ignore",
  E: "_ignore",
};

// Long flags that take a value (mapped ones act; the rest are consumed + dropped).
const LONG_VALUE_FLAGS = new Set([
  "request",
  "header",
  "data",
  "data-raw",
  "data-ascii",
  "data-binary",
  "data-urlencode",
  "form",
  "form-string",
  "user",
  "user-agent",
  "cookie",
  "referer",
  "url",
  "output",
  "connect-timeout",
  "max-time",
  "proxy",
  "proxy-user",
  "cacert",
  "cert",
  "cert-type",
  "key",
  "retry",
  "retry-delay",
  "retry-max-time",
  "resolve",
  "write-out",
  "dump-header",
  "limit-rate",
  "range",
  "oauth2-bearer",
  "aws-sigv4",
  "cookie-jar",
  "upload-file",
  "interface",
  "config",
  "continue-at",
  "time-cond",
  "ciphers",
]);

/** Parse a cURL command into an id-free request description, or `null` when it
 *  isn't a cURL command / carries no URL. */
export function parseCurl(text: string): ParsedCurl | null {
  if (!isCurlCommand(text)) return null;
  const tokens = tokenize(text.replace(/^\s*\$\s+/, ""));
  if (tokens[0]?.toLowerCase() === "curl") tokens.shift();

  let method = "";
  let url = "";
  const headers: Pair[] = [];
  const dataParts: string[] = [];
  const formParts: string[] = [];
  let asGet = false;
  let user = "";

  const applyValue = (name: string, val: string): void => {
    switch (name) {
      case "request":
        method = val.toUpperCase();
        break;
      case "header": {
        const idx = val.indexOf(":");
        if (idx !== -1)
          headers.push({ key: val.slice(0, idx).trim(), value: val.slice(idx + 1).trim() });
        break;
      }
      case "data":
      case "data-raw":
      case "data-ascii":
      case "data-binary":
      case "data-urlencode":
        dataParts.push(val);
        if (!method) method = "POST";
        break;
      case "form":
      case "form-string":
        formParts.push(val);
        if (!method) method = "POST";
        break;
      case "user":
        user = val;
        break;
      case "user-agent":
        headers.push({ key: "User-Agent", value: val });
        break;
      case "cookie":
        headers.push({ key: "Cookie", value: val });
        break;
      case "referer":
        headers.push({ key: "Referer", value: val });
        break;
      case "url":
        if (!url) url = val;
        break;
      // "output", timeouts, proxy, tls, … → consumed above, ignored here.
    }
  };

  const applyBool = (name: string): void => {
    if (name === "get" || name === "G") asGet = true;
    else if (name === "head" || name === "I") {
      if (!method) method = "HEAD";
    }
    // else boolean noise (silent, location, insecure, compressed, verbose, …).
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.startsWith("--")) {
      let name = tok.slice(2);
      let val: string | undefined;
      const eq = name.indexOf("=");
      if (eq !== -1) {
        val = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      name = name.toLowerCase();
      if (LONG_VALUE_FLAGS.has(name)) {
        applyValue(name, val ?? tokens[++i] ?? "");
      } else {
        applyBool(name);
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      let j = 1;
      while (j < tok.length) {
        const ch = tok[j];
        const canon = SHORT_VALUE_FLAGS[ch];
        if (canon) {
          const attached = tok.slice(j + 1);
          applyValue(canon, attached !== "" ? attached : (tokens[++i] ?? ""));
          break; // a value flag consumes the rest of the token
        }
        applyBool(ch);
        j++;
      }
    } else if (!url) {
      url = tok;
    }
  }

  if (!url) return null;

  if (user) headers.push({ key: "Authorization", value: `Basic ${safeBtoa(user)}` });

  if (!method) method = dataParts.length || formParts.length ? "POST" : "GET";
  if (asGet) method = "GET";

  // Pull any query string off the URL into params (Postman-style).
  const params: Pair[] = [];
  let cleanUrl = url;
  const qi = url.indexOf("?");
  if (qi !== -1) {
    cleanUrl = url.slice(0, qi);
    params.push(...splitPairs(url.slice(qi + 1)));
  }

  const ct = headers.find((h) => h.key.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";

  let bodyMode: BodyMode = "none";
  let body = "";
  let formFields: Pair[] = [];
  let multipart: ParsedMultipart[] = [];
  let binaryPath = "";

  if (formParts.length) {
    bodyMode = "multipart";
    multipart = formParts.map(parseFormPart);
  } else if (dataParts.length) {
    const data = dataParts.join("&");
    if (asGet) {
      params.push(...splitPairs(data)); // -G: data becomes query params
    } else if (dataParts[0].startsWith("@")) {
      bodyMode = "binary"; // -d/--data-binary @file → raw file body
      binaryPath = stripFileRef(dataParts[0]);
    } else if (ct.includes("json") || looksLikeJson(data)) {
      bodyMode = "json";
      body = data;
    } else if (ct.includes("x-www-form-urlencoded") || looksLikeForm(data)) {
      bodyMode = "form";
      formFields = splitPairs(data);
    } else {
      bodyMode = "text";
      body = data;
    }
  }

  return {
    name: nameFor(method, cleanUrl),
    method,
    url: cleanUrl,
    params,
    // Drop Content-Length — it's derived from the body by the HTTP client, so a
    // copied value goes stale the moment the request is edited (see the app's
    // Content-Length handling in the collection/Postman importers too).
    headers: headers.filter((h) => h.key.trim().toLowerCase() !== "content-length"),
    bodyMode,
    body,
    formFields,
    multipart,
    binaryPath,
  };
}

function nameFor(method: string, url: string): string {
  try {
    const u = new URL(url);
    return `${method} ${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return "Imported request";
  }
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (!(t.startsWith("{") || t.startsWith("["))) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

/** `key=value(&key=value)*` with non-empty, space-free keys. */
function looksLikeForm(s: string): boolean {
  return /^[^=&\s]+=[^&]*(?:&[^=&\s]+=[^&]*)*$/.test(s.trim());
}

function splitPairs(s: string): Pair[] {
  return s
    .split("&")
    .filter(Boolean)
    .map((p) => {
      const eq = p.indexOf("=");
      return eq === -1
        ? { key: safeDecode(p), value: "" }
        : { key: safeDecode(p.slice(0, eq)), value: safeDecode(p.slice(eq + 1)) };
    });
}

function parseFormPart(part: string): ParsedMultipart {
  const eq = part.indexOf("=");
  const key = eq === -1 ? part : part.slice(0, eq);
  const rest = eq === -1 ? "" : part.slice(eq + 1);
  if (rest.startsWith("@") || rest.startsWith("<")) {
    return { key, kind: "file", value: "", filePath: stripFileRef(rest) };
  }
  return { key, kind: "text", value: rest, filePath: "" };
}

/** Strip a `@`/`<` prefix and any trailing `;type=…`/`;filename=…` from a curl
 *  file reference, leaving the bare path. */
function stripFileRef(ref: string): string {
  const path = ref.replace(/^[@<]/, "");
  const semi = path.indexOf(";");
  return semi === -1 ? path : path.slice(0, semi);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function safeBtoa(s: string): string {
  try {
    return btoa(s);
  } catch {
    return s;
  }
}
