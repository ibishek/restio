// Request → code-snippet generators, one per target. Pure and dependency-free.
// Consumes an HttpRequest as-is — the caller decides whether to resolve `{{vars}}`
// first (see CodeDialog). Content-Type is injected to mirror what the Rust engine
// sends by default (json/text/form/binary); multipart libraries set their own
// boundary, so we never emit Content-Type for it.

import type { HttpRequest } from "#lib/types";
import { authAdditions } from "./auth";

export type CodeTarget =
  | "curl"
  | "httpie"
  | "fetch"
  | "axios"
  | "python"
  | "go"
  | "php"
  | "phpcurl"
  | "laravel"
  | "ruby"
  | "java"
  | "kotlin"
  | "swift"
  | "dart"
  | "dio"
  | "csharp";

/** `lang` groups the list (and widens search — e.g. "flutter" finds Dart). */
export const CODE_TARGETS: { id: CodeTarget; label: string; lang: string }[] = [
  { id: "curl", label: "cURL", lang: "Shell" },
  { id: "httpie", label: "HTTPie", lang: "Shell" },
  { id: "fetch", label: "Fetch", lang: "JavaScript" },
  { id: "axios", label: "Axios", lang: "JavaScript" },
  { id: "python", label: "requests", lang: "Python" },
  { id: "go", label: "net/http", lang: "Go" },
  { id: "php", label: "Guzzle", lang: "PHP" },
  { id: "phpcurl", label: "cURL", lang: "PHP" },
  { id: "laravel", label: "Laravel Http", lang: "PHP" },
  { id: "ruby", label: "Net::HTTP", lang: "Ruby" },
  { id: "java", label: "HttpClient", lang: "Java" },
  { id: "kotlin", label: "OkHttp", lang: "Kotlin" },
  { id: "swift", label: "URLSession", lang: "Swift" },
  { id: "dart", label: "http (Flutter)", lang: "Dart" },
  { id: "dio", label: "Dio (Flutter)", lang: "Dart" },
  { id: "csharp", label: "HttpClient", lang: "C#" },
];

export function generateCode(target: CodeTarget, req: HttpRequest): string {
  switch (target) {
    case "curl":
      return toCurl(req);
    case "httpie":
      return toHttpie(req);
    case "fetch":
      return toFetch(req);
    case "axios":
      return toAxios(req);
    case "python":
      return toPython(req);
    case "go":
      return toGo(req);
    case "php":
      return toPhp(req);
    case "phpcurl":
      return toPhpCurl(req);
    case "laravel":
      return toLaravel(req);
    case "ruby":
      return toRuby(req);
    case "java":
      return toJava(req);
    case "kotlin":
      return toKotlin(req);
    case "swift":
      return toSwift(req);
    case "dart":
      return toDart(req);
    case "dio":
      return toDio(req);
    case "csharp":
      return toCsharp(req);
  }
}

interface Field {
  key: string;
  value: string;
}

// ── shared helpers ───────────────────────────────────────────────────────────

/** URL with enabled query params appended (plus any API-key-in-query auth). */
function fullUrl(req: HttpRequest): string {
  const ps = [...req.params.filter((p) => p.enabled && p.key), ...authAdditions(req.auth).params];
  const cleanUrl = req.url.includes("?") ? req.url.slice(0, req.url.indexOf("?")) : req.url;
  if (!ps.length) return cleanUrl;
  const qs = ps.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&");
  return `${cleanUrl}?${qs}`;
}

function defaultContentType(req: HttpRequest): string {
  switch (req.bodyMode) {
    case "json":
      return req.body.trim() ? "application/json" : "";
    case "text":
      return req.body.trim() ? "text/plain; charset=utf-8" : "";
    case "form":
      return "application/x-www-form-urlencoded";
    case "binary":
      return req.binaryPath ? "application/octet-stream" : "";
    default:
      return ""; // multipart (boundary set by the client) / none
  }
}

/** Enabled headers, plus the engine's default Content-Type when the user hasn't
 *  set one. `dropContentType` strips it for multipart (the client owns it). */
function headers(req: HttpRequest, dropContentType = false): Field[] {
  let hs: Field[] = [
    ...req.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
    ...authAdditions(req.auth).headers,
  ];
  if (!hs.some((h) => h.key.toLowerCase() === "content-type")) {
    const ct = defaultContentType(req);
    if (ct) hs.push({ key: "Content-Type", value: ct });
  }
  if (dropContentType) hs = hs.filter((h) => h.key.toLowerCase() !== "content-type");
  return hs;
}

const enabledForm = (req: HttpRequest): Field[] =>
  req.formFields.filter((f) => f.enabled && f.key).map((f) => ({ key: f.key, value: f.value }));

const enabledParts = (req: HttpRequest) => req.multipart.filter((f) => f.enabled && f.key);

const baseName = (p: string): string => p.split(/[\\/]/).pop() || p;

const sh = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`; // shell single-quote
const js = (s: string): string => JSON.stringify(s); // JS / Python / Swift / Go / Java / C#
const php = (s: string): string => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
// Dart & Kotlin double-quoted strings interpolate `$…`, so escape it.
// Backslashes are escaped first to satisfy CodeQL's complete string escaping rule.
const dollar = (s: string): string =>
  `"${s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")}"`;
// Ruby single-quoted literal (avoids `#{}` interpolation entirely).
const rb = (s: string): string => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** `key=value&…` url-encoding of the enabled form fields (for raw-string bodies). */
const formEncoded = (req: HttpRequest): string =>
  enabledForm(req)
    .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
    .join("&");

/** A concise, language-agnostic description of a multipart body, for targets
 *  whose multipart API is too verbose to generate faithfully. */
const multipartComment = (req: HttpRequest, prefix: string): string =>
  enabledParts(req)
    .map((f) =>
      f.kind === "file"
        ? `${prefix} file field ${js(f.key)} ← ${f.filePath}`
        : `${prefix} text field ${js(f.key)} = ${js(f.value)}`,
    )
    .join("\n");

// ── cURL ─────────────────────────────────────────────────────────────────────

function toCurl(req: HttpRequest): string {
  const method = req.method.toUpperCase();
  const lines = [
    method === "GET" ? `curl ${sh(fullUrl(req))}` : `curl -X ${method} ${sh(fullUrl(req))}`,
  ];
  for (const h of headers(req, req.bodyMode === "multipart"))
    lines.push(`-H ${sh(`${h.key}: ${h.value}`)}`);
  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) lines.push(`--data-raw ${sh(req.body)}`);
  } else if (req.bodyMode === "form") {
    for (const f of enabledForm(req)) lines.push(`--data-urlencode ${sh(`${f.key}=${f.value}`)}`);
  } else if (req.bodyMode === "multipart") {
    for (const f of enabledParts(req)) {
      lines.push(`-F ${sh(f.kind === "file" ? `${f.key}=@${f.filePath}` : `${f.key}=${f.value}`)}`);
    }
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    lines.push(`--data-binary ${sh(`@${req.binaryPath}`)}`);
  }
  return lines.join(" \\\n  ");
}

// ── JavaScript (fetch) ─────────────────────────────────────────────────────────

function toFetch(req: HttpRequest): string {
  const pre: string[] = [];
  const opts = [`  method: ${js(req.method.toUpperCase())},`];
  let bodyExpr = "";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) bodyExpr = js(req.body);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `  ${js(f.key)}: ${js(f.value)},`)
      .join("\n");
    pre.push(`const params = new URLSearchParams({\n${e}\n});`);
    bodyExpr = "params";
  } else if (req.bodyMode === "multipart") {
    const b = ["const form = new FormData();"];
    for (const f of enabledParts(req)) {
      b.push(
        f.kind === "file"
          ? `form.append(${js(f.key)}, /* pick a File (e.g. input.files[0]); original path: ${f.filePath} */);`
          : `form.append(${js(f.key)}, ${js(f.value)});`,
      );
    }
    pre.push(b.join("\n"));
    bodyExpr = "form";
  } else if (req.bodyMode === "binary") {
    pre.push(
      `// Binary body — supply the file's bytes (Blob/ArrayBuffer); original path: ${req.binaryPath}`,
    );
    bodyExpr = "fileData";
  }

  const hs = headers(req, req.bodyMode === "multipart");
  if (hs.length) {
    const e = hs.map((h) => `    ${js(h.key)}: ${js(h.value)},`).join("\n");
    opts.push(`  headers: {\n${e}\n  },`);
  }
  if (bodyExpr) opts.push(`  body: ${bodyExpr},`);

  const preamble = pre.length ? `${pre.join("\n\n")}\n\n` : "";
  return `${preamble}const response = await fetch(${js(fullUrl(req))}, {\n${opts.join("\n")}\n});\nconst data = await response.json();`;
}

// ── Node (axios) ───────────────────────────────────────────────────────────────

function toAxios(req: HttpRequest): string {
  const pre = [`const axios = require("axios");`];
  const cfg = [`  method: ${js(req.method.toUpperCase())},`, `  url: ${js(fullUrl(req))},`];
  let dataExpr = "";
  const multipart = req.bodyMode === "multipart";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) dataExpr = js(req.body);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `  ${js(f.key)}: ${js(f.value)},`)
      .join("\n");
    pre.push(`const params = new URLSearchParams({\n${e}\n});`);
    dataExpr = "params";
  } else if (multipart) {
    pre.push(`const FormData = require("form-data");\nconst fs = require("fs");`);
    const b = ["const form = new FormData();"];
    for (const f of enabledParts(req)) {
      b.push(
        f.kind === "file"
          ? `form.append(${js(f.key)}, fs.createReadStream(${js(f.filePath)}));`
          : `form.append(${js(f.key)}, ${js(f.value)});`,
      );
    }
    pre.push(b.join("\n"));
    dataExpr = "form";
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    pre.push(`const fs = require("fs");`);
    dataExpr = `fs.readFileSync(${js(req.binaryPath)})`;
  }

  const hs = headers(req, multipart);
  if (hs.length || multipart) {
    const e = hs.map((h) => `    ${js(h.key)}: ${js(h.value)},`).join("\n");
    const spread = multipart ? `${hs.length ? "\n" : ""}    ...form.getHeaders(),` : "";
    cfg.push(`  headers: {\n${e}${spread}\n  },`);
  }
  if (dataExpr) cfg.push(`  data: ${dataExpr},`);
  return `${pre.join("\n\n")}\n\nconst response = await axios({\n${cfg.join("\n")}\n});`;
}

// ── Python (requests) ────────────────────────────────────────────────────────

function toPython(req: HttpRequest): string {
  const args = [js(req.method.toUpperCase()), js(fullUrl(req))];
  const multipart = req.bodyMode === "multipart";

  const hs = headers(req, multipart);
  if (hs.length) {
    const e = hs.map((h) => `        ${js(h.key)}: ${js(h.value)},`).join("\n");
    args.push(`headers={\n${e}\n    }`);
  }

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) args.push(`data=${js(req.body)}`);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `        ${js(f.key)}: ${js(f.value)},`)
      .join("\n");
    args.push(`data={\n${e}\n    }`);
  } else if (multipart) {
    const files = enabledParts(req).filter((f) => f.kind === "file");
    const texts = enabledParts(req).filter((f) => f.kind !== "file");
    if (files.length) {
      const e = files.map((f) => `        ${js(f.key)}: open(${js(f.filePath)}, "rb"),`).join("\n");
      args.push(`files={\n${e}\n    }`);
    }
    if (texts.length) {
      const e = texts.map((f) => `        ${js(f.key)}: ${js(f.value)},`).join("\n");
      args.push(`data={\n${e}\n    }`);
    }
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    args.push(`data=open(${js(req.binaryPath)}, "rb")`);
  }

  return `import requests\n\nresponse = requests.request(\n    ${args.join(",\n    ")},\n)`;
}

// ── PHP (Guzzle) ───────────────────────────────────────────────────────────────

function toPhp(req: HttpRequest): string {
  const opts: string[] = [];
  const multipart = req.bodyMode === "multipart";

  const hs = headers(req, multipart);
  if (hs.length) {
    const e = hs.map((h) => `        ${php(h.key)} => ${php(h.value)},`).join("\n");
    opts.push(`    'headers' => [\n${e}\n    ],`);
  }

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) opts.push(`    'body' => ${php(req.body)},`);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `        ${php(f.key)} => ${php(f.value)},`)
      .join("\n");
    opts.push(`    'form_params' => [\n${e}\n    ],`);
  } else if (multipart) {
    const parts = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `        [\n            'name' => ${php(f.key)},\n            'contents' => \\GuzzleHttp\\Psr7\\Utils::tryFopen(${php(f.filePath)}, 'r'),\n            'filename' => ${php(baseName(f.filePath))},\n        ],`
          : `        [\n            'name' => ${php(f.key)},\n            'contents' => ${php(f.value)},\n        ],`,
      )
      .join("\n");
    opts.push(`    'multipart' => [\n${parts}\n    ],`);
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    opts.push(`    'body' => \\GuzzleHttp\\Psr7\\Utils::tryFopen(${php(req.binaryPath)}, 'r'),`);
  }

  const block = opts.length ? ` [\n${opts.join("\n")}\n]` : " []";
  return `<?php\n$client = new \\GuzzleHttp\\Client();\n$response = $client->request(${php(req.method.toUpperCase())}, ${php(fullUrl(req))},${block});`;
}

// ── PHP (curl) ─────────────────────────────────────────────────────────────────

function toPhpCurl(req: HttpRequest): string {
  const multipart = req.bodyMode === "multipart";
  const opts = [
    `    CURLOPT_URL => ${php(fullUrl(req))},`,
    `    CURLOPT_RETURNTRANSFER => true,`,
    `    CURLOPT_CUSTOMREQUEST => ${php(req.method.toUpperCase())},`,
  ];

  const hs = headers(req, multipart);
  if (hs.length) {
    const e = hs.map((h) => `        ${php(`${h.key}: ${h.value}`)},`).join("\n");
    opts.push(`    CURLOPT_HTTPHEADER => [\n${e}\n    ],`);
  }

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) opts.push(`    CURLOPT_POSTFIELDS => ${php(req.body)},`);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `        ${php(f.key)} => ${php(f.value)},`)
      .join("\n");
    opts.push(`    CURLOPT_POSTFIELDS => http_build_query([\n${e}\n    ]),`);
  } else if (multipart) {
    const e = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `        ${php(f.key)} => new CURLFile(${php(f.filePath)}),`
          : `        ${php(f.key)} => ${php(f.value)},`,
      )
      .join("\n");
    opts.push(`    CURLOPT_POSTFIELDS => [\n${e}\n    ],`); // array ⇒ curl sends multipart/form-data
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    opts.push(`    CURLOPT_POSTFIELDS => file_get_contents(${php(req.binaryPath)}),`);
  }

  return `<?php
$ch = curl_init();
curl_setopt_array($ch, [
${opts.join("\n")}
]);
$response = curl_exec($ch);
curl_close($ch);
echo $response;`;
}

// ── PHP (Laravel Http) ─────────────────────────────────────────────────────────

function toLaravel(req: HttpRequest): string {
  const method = req.method.toLowerCase();
  const known = ["get", "post", "put", "patch", "delete", "head"].includes(method);
  const multipart = req.bodyMode === "multipart";
  const chain: string[] = [];

  // Headers (minus Content-Type — the body method / withBody sets it).
  const hs = headers(req, true).filter((h) => h.key.toLowerCase() !== "content-type");
  if (hs.length) {
    const e = hs.map((h) => `        ${php(h.key)} => ${php(h.value)},`).join("\n");
    chain.push(`    ->withHeaders([\n${e}\n    ])`);
  }

  // The data array passed to the verb call (form fields / multipart text fields).
  let dataArg = "";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) chain.push(`    ->withBody(${php(req.body)}, ${php(contentTypeOf(req))})`);
  } else if (req.bodyMode === "form") {
    chain.push(`    ->asForm()`);
    const e = enabledForm(req)
      .map((f) => `        ${php(f.key)} => ${php(f.value)},`)
      .join("\n");
    if (e) dataArg = `, [\n${e}\n    ]`;
  } else if (multipart) {
    for (const f of enabledParts(req).filter((p) => p.kind === "file"))
      chain.push(
        `    ->attach(${php(f.key)}, file_get_contents(${php(f.filePath)}), ${php(baseName(f.filePath))})`,
      );
    const texts = enabledParts(req).filter((p) => p.kind !== "file");
    if (texts.length) {
      const e = texts.map((f) => `        ${php(f.key)} => ${php(f.value)},`).join("\n");
      dataArg = `, [\n${e}\n    ]`;
    }
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    chain.push(
      `    ->withBody(file_get_contents(${php(req.binaryPath)}), ${php(contentTypeOf(req))})`,
    );
  }

  // `->get('url')` etc. for standard verbs; `->send('METHOD', 'url')` otherwise.
  const call = known
    ? `    ->${method}(${php(fullUrl(req))}${dataArg})`
    : `    ->send(${php(req.method.toUpperCase())}, ${php(fullUrl(req))}${dataArg})`;
  chain.push(call);

  return `<?php
use Illuminate\\Support\\Facades\\Http;

$response = Http::${chain.join("\n").replace(/^ {4}->/, "")};`;
}

/** Content-Type used to build a body (user header wins, else the engine default,
 *  else JSON). Only consulted when the request actually has a body. */
function contentTypeOf(req: HttpRequest): string {
  return (
    headers(req).find((h) => h.key.toLowerCase() === "content-type")?.value ||
    defaultContentType(req) ||
    "application/json"
  );
}

// ── HTTPie ─────────────────────────────────────────────────────────────────────

function toHttpie(req: HttpRequest): string {
  const method = req.method.toUpperCase();
  const isForm = req.bodyMode === "form" || req.bodyMode === "multipart";
  const head = ["http", ...(isForm ? ["-f"] : []), method, sh(fullUrl(req))];
  const lines = [head.join(" ")];
  for (const h of headers(req, req.bodyMode === "multipart")) lines.push(sh(`${h.key}:${h.value}`));
  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) lines.push(`--raw=${sh(req.body)}`);
  } else if (req.bodyMode === "form") {
    for (const f of enabledForm(req)) lines.push(sh(`${f.key}=${f.value}`));
  } else if (req.bodyMode === "multipart") {
    for (const f of enabledParts(req))
      lines.push(sh(f.kind === "file" ? `${f.key}@${f.filePath}` : `${f.key}=${f.value}`));
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    lines.push(`< ${sh(req.binaryPath)}`);
  }
  return lines.join(" \\\n  ");
}

// ── Go (net/http) ──────────────────────────────────────────────────────────────

function toGo(req: HttpRequest): string {
  const imports = new Set(["fmt", "io", "net/http"]);
  const pre: string[] = [];
  let bodyArg = "nil";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) {
      imports.add("strings");
      pre.push(`body := strings.NewReader(${js(req.body)})`);
      bodyArg = "body";
    }
  } else if (req.bodyMode === "form") {
    imports.add("strings");
    pre.push(`body := strings.NewReader(${js(formEncoded(req))})`);
    bodyArg = "body";
  } else if (req.bodyMode === "multipart") {
    pre.push(multipartComment(req, "\t// multipart:"));
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    imports.add("os");
    pre.push(`file, _ := os.Open(${js(req.binaryPath)})`, `defer file.Close()`);
    bodyArg = "file";
  }

  const imp = [...imports].map((i) => `\t${js(i)}`).join("\n");
  const preBlock = pre.length
    ? pre.map((l) => (l.startsWith("\t") ? l : `\t${l}`)).join("\n") + "\n"
    : "";
  const hdrs = headers(req, req.bodyMode === "multipart")
    .map((h) => `\treq.Header.Set(${js(h.key)}, ${js(h.value)})`)
    .join("\n");
  return `package main

import (
${imp}
)

func main() {
${preBlock}\treq, _ := http.NewRequest(${js(req.method.toUpperCase())}, ${js(fullUrl(req))}, ${bodyArg})
${hdrs}${hdrs ? "\n" : ""}\tresp, _ := http.DefaultClient.Do(req)
\tdefer resp.Body.Close()
\tdata, _ := io.ReadAll(resp.Body)
\tfmt.Println(string(data))
}`;
}

// ── Ruby (Net::HTTP) ─────────────────────────────────────────────────────────

function toRuby(req: HttpRequest): string {
  const m = req.method.toUpperCase();
  const klass = m.charAt(0) + m.slice(1).toLowerCase(); // GET → Get
  const lines = [
    `require 'net/http'`,
    `require 'uri'`,
    ``,
    `uri = URI(${rb(fullUrl(req))})`,
    `http = Net::HTTP.new(uri.host, uri.port)`,
    `http.use_ssl = uri.scheme == 'https'`,
    ``,
    `request = Net::HTTP::${klass}.new(uri)`,
  ];
  for (const h of headers(req, req.bodyMode === "multipart"))
    lines.push(`request[${rb(h.key)}] = ${rb(h.value)}`);

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) lines.push(`request.body = ${rb(req.body)}`);
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `  ${rb(f.key)} => ${rb(f.value)},`)
      .join("\n");
    lines.push(`request.set_form_data({\n${e}\n})`);
  } else if (req.bodyMode === "multipart") {
    const e = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `  [${rb(f.key)}, File.open(${rb(f.filePath)})],`
          : `  [${rb(f.key)}, ${rb(f.value)}],`,
      )
      .join("\n");
    lines.push(`request.set_form([\n${e}\n], 'multipart/form-data')`);
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    lines.push(`request.body = File.binread(${rb(req.binaryPath)})`);
  }

  lines.push(``, `response = http.request(request)`, `puts response.body`);
  return lines.join("\n");
}

// ── Java (java.net.http) ───────────────────────────────────────────────────────

function toJava(req: HttpRequest): string {
  let publisher = "HttpRequest.BodyPublishers.noBody()";
  let note = "";
  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) publisher = `HttpRequest.BodyPublishers.ofString(${js(req.body)})`;
  } else if (req.bodyMode === "form") {
    publisher = `HttpRequest.BodyPublishers.ofString(${js(formEncoded(req))})`;
  } else if (req.bodyMode === "multipart") {
    note =
      multipartComment(req, "//") +
      "\n// java.net.http has no multipart builder — send the assembled body above.\n";
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    publisher = `HttpRequest.BodyPublishers.ofFile(java.nio.file.Path.of(${js(req.binaryPath)}))`;
  }
  const hdrs = headers(req, req.bodyMode === "multipart")
    .map((h) => `    .header(${js(h.key)}, ${js(h.value)})`)
    .join("\n");
  return `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

${note}HttpClient client = HttpClient.newHttpClient();
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create(${js(fullUrl(req))}))
${hdrs}${hdrs ? "\n" : ""}    .method(${js(req.method.toUpperCase())}, ${publisher})
    .build();
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`;
}

// ── Kotlin (OkHttp) ────────────────────────────────────────────────────────────

function toKotlin(req: HttpRequest): string {
  const imports = [
    "import okhttp3.*",
    "import okhttp3.MediaType.Companion.toMediaType",
    "import okhttp3.RequestBody.Companion.toRequestBody",
  ];
  const pre: string[] = [];
  let bodyVar = "null";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) {
      pre.push(
        `val body = ${dollar(req.body)}.toRequestBody(${dollar(contentTypeOf(req))}.toMediaType())`,
      );
      bodyVar = "body";
    }
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `    .add(${dollar(f.key)}, ${dollar(f.value)})`)
      .join("\n");
    pre.push(`val body = FormBody.Builder()\n${e}\n    .build()`);
    bodyVar = "body";
  } else if (req.bodyMode === "multipart") {
    imports.push("import okhttp3.RequestBody.Companion.asRequestBody", "import java.io.File");
    const e = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `    .addFormDataPart(${dollar(f.key)}, ${dollar(baseName(f.filePath))}, File(${dollar(f.filePath)}).asRequestBody())`
          : `    .addFormDataPart(${dollar(f.key)}, ${dollar(f.value)})`,
      )
      .join("\n");
    pre.push(`val body = MultipartBody.Builder().setType(MultipartBody.FORM)\n${e}\n    .build()`);
    bodyVar = "body";
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    imports.push("import okhttp3.RequestBody.Companion.asRequestBody", "import java.io.File");
    pre.push(
      `val body = File(${dollar(req.binaryPath)}).asRequestBody(${dollar(contentTypeOf(req))}.toMediaType())`,
    );
    bodyVar = "body";
  }

  const hdrs = headers(req, req.bodyMode === "multipart")
    .map((h) => `    .addHeader(${dollar(h.key)}, ${dollar(h.value)})`)
    .join("\n");
  const preBlock = pre.length ? pre.join("\n") + "\n\n" : "";
  return `${imports.join("\n")}

val client = OkHttpClient()
${preBlock}val request = Request.Builder()
    .url(${dollar(fullUrl(req))})
    .method(${dollar(req.method.toUpperCase())}, ${bodyVar})
${hdrs}${hdrs ? "\n" : ""}    .build()
client.newCall(request).execute().use { response ->
    println(response.body?.string())
}`;
}

// ── Swift (URLSession) ─────────────────────────────────────────────────────────

function toSwift(req: HttpRequest): string {
  const lines = [
    `import Foundation`,
    ``,
    `var request = URLRequest(url: URL(string: ${js(fullUrl(req))})!)`,
    `request.httpMethod = ${js(req.method.toUpperCase())}`,
  ];
  for (const h of headers(req, req.bodyMode === "multipart"))
    lines.push(`request.addValue(${js(h.value)}, forHTTPHeaderField: ${js(h.key)})`);

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) lines.push(`request.httpBody = ${js(req.body)}.data(using: .utf8)`);
  } else if (req.bodyMode === "form") {
    lines.push(`request.httpBody = ${js(formEncoded(req))}.data(using: .utf8)`);
  } else if (req.bodyMode === "multipart") {
    lines.push(multipartComment(req, "//"));
    lines.push(
      `// Build a multipart/form-data body with a boundary and set it on request.httpBody.`,
    );
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    lines.push(
      `request.httpBody = try Data(contentsOf: URL(fileURLWithPath: ${js(req.binaryPath)}))`,
    );
  }

  lines.push(
    ``,
    `let (data, _) = try await URLSession.shared.data(for: request)`,
    `print(String(data: data, encoding: .utf8) ?? "")`,
  );
  return lines.join("\n");
}

// ── Dart (http — Flutter) ──────────────────────────────────────────────────────

function toDart(req: HttpRequest): string {
  const method = req.method.toUpperCase();
  const hdr = headers(req, req.bodyMode === "multipart");
  const hdrMap = hdr.length
    ? `request.headers.addAll({\n${hdr.map((h) => `    ${dollar(h.key)}: ${dollar(h.value)},`).join("\n")}\n  });`
    : "";

  if (req.bodyMode === "multipart") {
    const parts = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `  request.files.add(await http.MultipartFile.fromPath(${dollar(f.key)}, ${dollar(f.filePath)}));`
          : `  request.fields[${dollar(f.key)}] = ${dollar(f.value)};`,
      )
      .join("\n");
    return `import 'package:http/http.dart' as http;

Future<void> main() async {
  final request = http.MultipartRequest(${dollar(method)}, Uri.parse(${dollar(fullUrl(req))}));
${hdrMap ? "  " + hdrMap + "\n" : ""}${parts}
  final response = await http.Response.fromStream(await request.send());
  print(response.body);
}`;
  }

  let bodyLine = "";
  let ioImport = "";
  if ((req.bodyMode === "json" || req.bodyMode === "text") && req.body) {
    bodyLine = `  request.body = ${dollar(req.body)};`;
  } else if (req.bodyMode === "form") {
    const e = enabledForm(req)
      .map((f) => `    ${dollar(f.key)}: ${dollar(f.value)},`)
      .join("\n");
    bodyLine = `  request.bodyFields = {\n${e}\n  };`;
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    ioImport = "import 'dart:io';\n";
    bodyLine = `  request.bodyBytes = await File(${dollar(req.binaryPath)}).readAsBytes();`;
  }

  return `${ioImport}import 'package:http/http.dart' as http;

Future<void> main() async {
  final request = http.Request(${dollar(method)}, Uri.parse(${dollar(fullUrl(req))}));
${hdrMap ? "  " + hdrMap + "\n" : ""}${bodyLine ? bodyLine + "\n" : ""}  final response = await http.Response.fromStream(await request.send());
  print(response.body);
}`;
}

// ── Dart (Dio — Flutter) ───────────────────────────────────────────────────────

function toDio(req: HttpRequest): string {
  const hdr = headers(req, req.bodyMode === "multipart");
  const optLines = [`      method: ${dollar(req.method.toUpperCase())},`];
  if (hdr.length) {
    const e = hdr.map((h) => `        ${dollar(h.key)}: ${dollar(h.value)},`).join("\n");
    optLines.push(`      headers: {\n${e}\n      },`);
  }

  const pre: string[] = [];
  let ioImport = "";
  let dataExpr = "";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) dataExpr = dollar(req.body);
  } else if (req.bodyMode === "form") {
    optLines.push(`      contentType: Headers.formUrlEncodedContentType,`);
    const e = enabledForm(req)
      .map((f) => `    ${dollar(f.key)}: ${dollar(f.value)},`)
      .join("\n");
    dataExpr = `{\n${e}\n  }`;
  } else if (req.bodyMode === "multipart") {
    const e = enabledParts(req)
      .map((f) =>
        f.kind === "file"
          ? `    ${dollar(f.key)}: await MultipartFile.fromFile(${dollar(f.filePath)}, filename: ${dollar(baseName(f.filePath))}),`
          : `    ${dollar(f.key)}: ${dollar(f.value)},`,
      )
      .join("\n");
    pre.push(`  final formData = FormData.fromMap({\n${e}\n  });`);
    dataExpr = "formData";
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    ioImport = "import 'dart:io';\n";
    dataExpr = `await File(${dollar(req.binaryPath)}).readAsBytes()`;
  }

  const preBlock = pre.length ? pre.join("\n") + "\n" : "";
  const dataLine = dataExpr ? `\n    data: ${dataExpr},` : "";
  return `${ioImport}import 'package:dio/dio.dart';

Future<void> main() async {
  final dio = Dio();
${preBlock}  final response = await dio.request(
    ${dollar(fullUrl(req))},
    options: Options(
${optLines.join("\n")}
    ),${dataLine}
  );
  print(response.data);
}`;
}

// ── C# (HttpClient) ────────────────────────────────────────────────────────────

function toCsharp(req: HttpRequest): string {
  const usings = ["using System;", "using System.Net.Http;", "using System.Threading.Tasks;"];
  const setup: string[] = [];
  let content = "";

  if (req.bodyMode === "json" || req.bodyMode === "text") {
    if (req.body) {
      usings.push("using System.Text;");
      content = `request.Content = new StringContent(${js(req.body)}, Encoding.UTF8, ${js(contentTypeOf(req))});`;
    }
  } else if (req.bodyMode === "form") {
    usings.push("using System.Collections.Generic;");
    const e = enabledForm(req)
      .map((f) => `    { ${js(f.key)}, ${js(f.value)} },`)
      .join("\n");
    content = `request.Content = new FormUrlEncodedContent(new Dictionary<string, string>\n{\n${e}\n});`;
  } else if (req.bodyMode === "multipart") {
    usings.push("using System.IO;");
    setup.push("var content = new MultipartFormDataContent();");
    for (const f of enabledParts(req)) {
      setup.push(
        f.kind === "file"
          ? `content.Add(new StreamContent(File.OpenRead(${js(f.filePath)})), ${js(f.key)}, ${js(baseName(f.filePath))});`
          : `content.Add(new StringContent(${js(f.value)}), ${js(f.key)});`,
      );
    }
    content = "request.Content = content;";
  } else if (req.bodyMode === "binary" && req.binaryPath) {
    usings.push("using System.IO;");
    content = `request.Content = new ByteArrayContent(File.ReadAllBytes(${js(req.binaryPath)}));`;
  }

  const hdrs = headers(req, req.bodyMode === "multipart")
    .filter((h) => h.key.toLowerCase() !== "content-type") // set via the Content constructor
    .map((h) => `request.Headers.Add(${js(h.key)}, ${js(h.value)});`)
    .join("\n");
  const uniqUsings = [...new Set(usings)].join("\n");
  const setupBlock = setup.length ? setup.join("\n") + "\n" : "";
  return `${uniqUsings}

var client = new HttpClient();
var request = new HttpRequestMessage(new HttpMethod(${js(req.method.toUpperCase())}), ${js(fullUrl(req))});
${hdrs}${hdrs ? "\n" : ""}${setupBlock}${content ? content + "\n" : ""}var response = await client.SendAsync(request);
var body = await response.Content.ReadAsStringAsync();
Console.WriteLine(body);`;
}
