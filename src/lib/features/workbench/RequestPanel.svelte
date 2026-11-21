<script lang="ts">
  import Icon from "#lib/components/ui/Icon.svelte";
  import AuthEditor from "./AuthEditor.svelte";
  import VarInput from "./VarInput.svelte";
  import { pickFile } from "#lib/ipc";
  import type { BodyMode, HttpMethod, KeyValue, MultipartField } from "#lib/types";
  import { isCurlCommand } from "#lib/utils/curl";
  import { checkJson, formatJson } from "#lib/utils/json";
  import { findVars, interpolate } from "#lib/utils/interpolate";
  import { mergeUrlWithParams, syncParamsFromUrl, uid } from "#lib/utils/query";
  import {
    activeTab,
    addSseHeadersToActive,
    send,
    cancel,
    importCurl,
    saveCurrentRequest,
    isTabDirty,
    methodColor,
    addRow,
    removeRow,
    clearRows,
    ensureTrailingRow,
    addMultipart,
    removeMultipart,
    clearMultipart,
    ensureTrailingMultipart,
    currentUnresolved,
    activeEnvName,
    activeEnvVarMap,
    getVariableInfo,
    effectiveUrl,
    effectivePrefix,
    effectiveAuth,
    authSource,
    toggleCurrentRequestDeprecated,
    type ReqTab,
  } from "./state.svelte";

  // The focused tab — the request currently being edited. Only rendered when a
  // tab is open (Workbench guards the empty state), so it's always present here.
  const tab = $derived(activeTab()!);

  const unresolved = $derived(currentUnresolved());

  // What an "inherit" request actually picks up from an ancestor folder/collection,
  // and whether any auth is effectively applied (drives the tab indicator dot).
  const inheritedFrom = $derived(authSource(tab.requestLocation, tab.request.auth));
  const authApplied = $derived(effectiveAuth(tab.requestLocation, tab.request.auth).type !== "none");
  const AUTH_LABELS: Record<string, string> = {
    bearer: "Bearer Token",
    basic: "Basic Auth",
    apikey: "API Key",
    none: "No Auth",
  };
  // Full URL after the collection base URL + folder prefixes are applied, plus
  // just the prepended prefix (shown read-only inside the URL bar so the fully
  // qualified URI is visible while the input still edits only the path).
  const effUrl = $derived(effectiveUrl());
  const pfx = $derived(effectivePrefix());
  const rawUrl = $derived(tab.request.url.trim());
  const varMap = $derived(activeEnvVarMap());
  const resolvedUrl = $derived(interpolate(effUrl, varMap));
  const urlVars = $derived(findVars(effUrl));
  const urlVarDetails = $derived(urlVars.map((name) => getVariableInfo(name)));
  const hasPrefix = $derived(effUrl !== tab.request.url && effUrl.trim() !== "");
  const hasVars = $derived(urlVars.length > 0);
  const shouldShowResolvedBar = $derived(rawUrl !== "" && (hasVars || hasPrefix));

  let copiedResolvedUrl = $state(false);
  function copyResolved(url: string) {
    void navigator.clipboard.writeText(url);
    copiedResolvedUrl = true;
    setTimeout(() => {
      copiedResolvedUrl = false;
    }, 1500);
  }

  // Actions that operate on a real request (Send / Code / Deprecate) are
  // meaningless without a URL — disable them until one is entered.
  const noUrl = $derived(tab.request.url.trim() === "");

  // Has the request got unsaved changes? Drives the Save button's enabled state
  // so a clean request can't be pointlessly re-saved.
  const dirty = $derived(isTabDirty(tab));

  // Advisory JSON validation — only in JSON mode, and non-blocking (an invalid
  // body can still be sent). `null` when the body isn't JSON, so we don't parse
  // large text/raw bodies on every keystroke.
  const jsonCheck = $derived(tab.request.bodyMode === "json" ? checkJson(tab.request.body) : null);

  /** Pretty-print the JSON body in place (2-space indent). No-op if invalid. */
  function formatBody() {
    const pretty = formatJson(tab.request.body);
    if (pretty !== null) tab.request.body = pretty;
  }

  const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const tabs: { id: ReqTab; label: string }[] = [
    { id: "params", label: "Params" },
    { id: "headers", label: "Headers" },
    { id: "body", label: "Body" },
    { id: "auth", label: "Auth" },
    { id: "scripts", label: "Scripts" },
    { id: "settings", label: "Settings" },
  ];

  let scriptSubTab = $state<"prerequest" | "tests">("prerequest");

  interface Snippet {
    name: string;
    description: string;
    code: string;
  }

  const PRE_REQUEST_SNIPPETS: Snippet[] = [
    {
      name: "Fake User Payload (Faker)",
      description: "Generate and send realistic fake user payload",
      code: `// Generate realistic fake user payload using faker
const fakeUser = {
  name: faker.person.fullName(),
  email: faker.internet.email(),
  jobTitle: faker.person.jobTitle(),
  company: faker.company.name(),
  phone: faker.phone.number(),
  avatar: faker.image.avatar(),
  address: {
    city: faker.location.city(),
    country: faker.location.country(),
  },
};

// Set payload directly as the outgoing request body
rio.request.body = JSON.stringify(fakeUser, null, 2);
console.log("Generated fake payload for:", fakeUser.name);
`,
    },
    {
      name: "Fake Commerce / Product (Faker)",
      description: "Generate dynamic fake product data",
      code: `const fakeProduct = {
  title: faker.commerce.productName(),
  price: parseFloat(faker.commerce.price()),
  department: faker.commerce.department(),
  sku: faker.string.alphanumeric(8).toUpperCase(),
  inStock: true,
};

rio.request.body = JSON.stringify(fakeProduct, null, 2);
`,
    },
    {
      name: "Fake Variables for {{vars}} (Faker)",
      description: "Generate fake data variables for {{name}}, {{email}} substitution",
      code: `// Populate variables for use in URL, params, headers, or body
rio.setEnv("fakeName", faker.person.fullName());
rio.setEnv("fakeEmail", faker.internet.email());
rio.setEnv("fakeUuid", faker.string.uuid());
rio.setEnv("fakePhone", faker.phone.number());
`,
    },
    {
      name: "Set environment variable",
      description: "Sets or updates an environment variable value",
      code: 'rio.environment.set("variable_key", "variable_value");\n',
    },
    {
      name: "Get environment variable",
      description: "Gets the value of an environment variable",
      code: 'const val = rio.environment.get("variable_key");\nconsole.log("Value:", val);\n',
    },
    {
      name: "Generate timestamp",
      description: "Sets an environment variable with current unix timestamp",
      code: 'rio.environment.set("timestamp", Date.now().toString());\n',
    },
    {
      name: "Generate UUID",
      description: "Sets an environment variable with a random UUID",
      code: 'rio.environment.set("uuid", crypto.randomUUID());\n',
    },
  ];

  const TEST_SNIPPETS: Snippet[] = [
    {
      name: "Status code: Code is 200",
      description: "Assert that HTTP status code equals 200",
      code: 'rio.test("Status code is 200", function () {\n    rio.response.to.have.status(200);\n});\n',
    },
    {
      name: "Status code: Successful (2xx)",
      description: "Assert that HTTP status is within 200-299",
      code: 'rio.test("Successful response", function () {\n    rio.expect(rio.response.code).to.be.within(200, 299);\n});\n',
    },
    {
      name: "Response body: JSON value check",
      description: "Inspect parsed JSON response property",
      code: 'rio.test("Check JSON response property", function () {\n    const jsonData = rio.response.json();\n    rio.expect(jsonData.success).to.eql(true);\n});\n',
    },
    {
      name: "Set environment variable from JSON response",
      description: "Extract a token or ID into active environment",
      code: 'const jsonData = rio.response.json();\nrio.environment.set("token", jsonData.token || jsonData.access_token);\n',
    },
    {
      name: "Response time is less than 200ms",
      description: "Assert response round-trip time in milliseconds",
      code: 'rio.test("Response time is less than 200ms", function () {\n    rio.expect(rio.response.responseTime).to.be.below(200);\n});\n',
    },
    {
      name: "Response headers: Content-Type present",
      description: "Verify header exists in response",
      code: 'rio.test("Content-Type is present", function () {\n    rio.response.to.have.header("content-type");\n});\n',
    },
  ];

  function insertSnippet(code: string) {
    if (scriptSubTab === "prerequest") {
      const cur = tab.request.preRequestScript ?? "";
      tab.request.preRequestScript = cur.trim() ? `${cur.trimEnd()}\n\n${code}` : code;
    } else {
      const cur = tab.request.testScript ?? "";
      tab.request.testScript = cur.trim() ? `${cur.trimEnd()}\n\n${code}` : code;
    }
  }

  // Common request headers suggested while typing a header key, most-used first.
  // Auth headers (Authorization, Proxy-Authorization) are intentionally omitted —
  // they belong in the Auth tab.
  const COMMON_HEADERS = [
    "Content-Type",
    "Accept",
    "User-Agent",
    "Accept-Encoding",
    "Accept-Language",
    "Cache-Control",
    "Cookie",
    "Host",
    "Origin",
    "Referer",
    "Content-Length",
    "Connection",
    "If-None-Match",
    "If-Modified-Since",
    "Range",
    "X-Requested-With",
    "X-Forwarded-For",
    "Pragma",
    "Accept-Charset",
    "Date",
  ];

  // Custom header-key autocomplete. We don't use a native <datalist> because the
  // webview renders its dropdown right-aligned to the input and its position
  // isn't controllable; this dropdown is positioned under the input from its
  // bounding rect (fixed, so the rows' overflow-hidden doesn't clip it).
  let sug = $state<{
    row: KeyValue;
    list: KeyValue[];
    items: string[];
    index: number;
    left: number;
    top: number;
    width: number;
  } | null>(null);

  function headerMatches(key: string): string[] {
    const q = key.trim().toLowerCase();
    return COMMON_HEADERS.filter((h) => h.toLowerCase() !== q && h.toLowerCase().includes(q));
  }

  function openSuggest(row: KeyValue, list: KeyValue[], el: HTMLInputElement) {
    const items = headerMatches(row.key);
    if (!items.length) {
      sug = null;
      return;
    }
    const r = el.getBoundingClientRect();
    sug = { row, list, items, index: 0, left: r.left, top: r.bottom + 2, width: r.width };
  }

  function chooseSuggest(item: string) {
    if (!sug) return;
    sug.row.key = item;
    ensureTrailingRow(sug.list);
    sug = null;
  }

  function suggestKeydown(e: KeyboardEvent) {
    if (!sug) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      sug.index = (sug.index + 1) % sug.items.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      sug.index = (sug.index - 1 + sug.items.length) % sug.items.length;
    } else if (e.key === "Enter" && sug.items[sug.index]) {
      e.preventDefault();
      chooseSuggest(sug.items[sug.index]);
    } else if (e.key === "Escape") {
      sug = null;
    }
  }

  const bodyModes: { id: BodyMode; label: string }[] = [
    { id: "none", label: "None" },
    { id: "json", label: "JSON" },
    { id: "text", label: "Text" },
    { id: "form", label: "Form" },
    { id: "multipart", label: "Multipart" },
    { id: "binary", label: "Binary" },
  ];

  /** Final path segment, for a compact filename label (full path in `title`). */
  const baseName = (p: string) => p.split(/[\\/]/).pop() || p;

  /** Open the native picker for a multipart file field. No-op outside Tauri. */
  async function chooseMultipartFile(row: MultipartField) {
    try {
      const path = await pickFile();
      if (path) {
        row.filePath = path;
        ensureTrailingMultipart(tab.request.multipart);
      }
    } catch {
      // No native dialog outside the Tauri shell (e.g. `pnpm dev`).
    }
  }

  /** Open the native picker for the binary body file. No-op outside Tauri. */
  async function chooseBinaryFile() {
    try {
      const path = await pickFile();
      if (path) tab.request.binaryPath = path;
    } catch {
      // No native dialog outside the Tauri shell.
    }
  }

  let methodOpen = $state(false);
  let saved = $state(false);
  let curlImported = $state(false);
  let codeOpen = $state(false);

  /** Paste into the URL bar: if it's a cURL command, import it instead of
   *  dumping the raw text into the field (the classic Postman affordance). */
  function onUrlPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!isCurlCommand(text)) return; // ordinary paste falls through
    e.preventDefault();
    if (importCurl(text)) {
      curlImported = true;
      setTimeout(() => (curlImported = false), 1800);
    }
  }

  function saveRequest() {
    if (!saveCurrentRequest()) return; // nothing changed — leave the button idle
    saved = true;
    setTimeout(() => (saved = false), 1400);
  }

  const activeCount = (list: KeyValue[]) =>
    list.filter((r) => r.enabled && (r.key || r.value)).length;

  function pickMethod(m: HttpMethod) {
    tab.request.method = m;
    methodOpen = false;
  }

  function onUrlInput() {
    tab.request.params = syncParamsFromUrl(tab.request.url, tab.request.params, uid);
  }

  function onParamsChange() {
    tab.request.url = mergeUrlWithParams(tab.request.url, tab.request.params);
  }

  // Keep URL bar and params in sync on tab switch / initial load:
  // If the request has active params and the URL lacks query string, reflect them in the URL bar.
  $effect(() => {
    const r = tab.request;
    if (r.params.some((p) => p.enabled && p.key.trim() !== "") && !r.url.includes("?")) {
      r.url = mergeUrlWithParams(r.url, r.params);
    } else if (r.url.includes("?") && r.params.every((p) => !p.key.trim() && !p.value.trim())) {
      r.params = syncParamsFromUrl(r.url, r.params, uid);
    }
  });

  function onWindowKey(e: KeyboardEvent) {
    if (e.key === "Escape") methodOpen = false;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }
</script>

<svelte:window onclick={() => (methodOpen = false)} onkeydown={onWindowKey} />

<section class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Request name -->
  <div class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
    <input
      bind:value={tab.request.name}
      class="min-w-0 flex-1 truncate bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink-faint {tab
        .request.deprecated
        ? 'text-ink-muted line-through'
        : ''}"
      placeholder="Untitled request"
      aria-label="Request name"
    />
    <button
      onclick={toggleCurrentRequestDeprecated}
      disabled={noUrl}
      title={tab.request.deprecated ? "Deprecated — click to clear" : "Mark as deprecated"}
      class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
      class:border-warn={tab.request.deprecated}
      class:text-warn={tab.request.deprecated}
      class:border-line={!tab.request.deprecated}
      class:text-ink-muted={!tab.request.deprecated}
      class:hover:border-line-strong={!tab.request.deprecated}
    >
      <Icon name="alert-triangle" size={13} />
      {tab.request.deprecated ? "Deprecated" : "Deprecate"}
    </button>
    <button
      onclick={() => (codeOpen = true)}
      disabled={noUrl}
      class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted"
    >
      <Icon name="code" size={13} />
      Code
    </button>
    <button
      onclick={saveRequest}
      disabled={!dirty && !saved}
      title={dirty ? "Save request" : "No unsaved changes"}
      class="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs font-medium transition-colors hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
      class:text-brand={saved}
      class:text-ink-muted={!saved}
    >
      <Icon name={saved ? "check" : "copy"} size={13} />
      {saved ? "Saved" : "Save"}
    </button>
  </div>

  <!-- Method + URL + Send -->
  <div class="flex shrink-0 items-stretch gap-2 px-4 pb-3">
    <div class="relative">
      <button
        onclick={(e) => {
          e.stopPropagation();
          methodOpen = !methodOpen;
        }}
        aria-haspopup="menu"
        aria-expanded={methodOpen}
        class="flex h-10 items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 font-mono text-sm font-bold {methodColor(
          tab.request.method,
        )} transition-colors hover:border-line-strong"
      >
        <span class="w-14 text-left">{tab.request.method}</span>
        <span class="text-ink-faint transition-transform" class:rotate-180={methodOpen}>
          <Icon name="chevron-down" size={14} />
        </span>
      </button>

      {#if methodOpen}
        <ul
          role="menu"
          class="absolute z-20 mt-1.5 w-40 overflow-hidden rounded-lg border border-line bg-panel shadow-2xl shadow-black/40"
        >
          {#each methods as m (m)}
            <li role="none">
              <button
                role="menuitem"
                onclick={(e) => {
                  e.stopPropagation();
                  pickMethod(m);
                }}
                class="flex w-full items-center gap-2 px-3 py-2 font-mono text-sm font-bold {methodColor(
                  m,
                )} transition-colors hover:bg-panel-2"
              >
                {m}
                {#if m === tab.request.method}
                  <span class="ml-auto text-brand"><Icon name="check" size={14} /></span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div
      class="flex h-10 min-w-0 flex-1 items-center overflow-hidden rounded-lg border border-line bg-panel-2 font-mono text-sm focus-within:border-brand/60"
    >
      {#if pfx}
        <span
          class="max-w-prefix shrink-0 truncate py-2 pl-3.5 text-ink-faint"
          title="Collection base URL + folder prefixes (applied automatically): {pfx}"
        >
          {pfx}
        </span>
      {/if}
      <VarInput
        bind:value={tab.request.url}
        onpaste={onUrlPaste}
        oninput={onUrlInput}
        placeholder={pfx
          ? "path (appended to the prefix)"
          : "https://api.example.com/endpoint — or paste a cURL command"}
        ariaLabel="Request URL"
        containerClass="h-full min-w-0 flex-1"
        class="bare-input h-full w-full bg-transparent py-2 pr-3.5 text-ink placeholder:text-ink-faint {pfx
          ? 'pl-0.5'
          : 'pl-3.5'}"
      />
    </div>

    {#if tab.sending}
      <button
        onclick={() => cancel()}
        class="flex h-10 items-center gap-2 rounded-lg border border-danger/50 bg-danger/10 px-5 text-sm font-semibold text-danger transition-all hover:bg-danger/20 active:scale-95"
      >
        <span class="size-4 animate-spin rounded-full border-2 border-danger/40 border-t-danger"></span>
        Cancel
      </button>
    {:else}
      <button
        onclick={() => send()}
        disabled={noUrl}
        class="flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-brand/20 transition-all hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="send" size={16} />
        Send
      </button>
    {/if}
  </div>

  {#if shouldShowResolvedBar}
    <div
      class="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border border-line/70 bg-panel-2/60 px-3 py-1.5 text-xs"
    >
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <Icon
          name="globe"
          size={13}
          class="shrink-0 {urlVarDetails.some((d) => !d.isDefined) ? 'text-warn' : 'text-brand'}"
        />
        <span class="font-mono text-12 text-ink break-all select-all font-medium">
          {resolvedUrl}
        </span>
      </div>
      <button
        type="button"
        onclick={() => copyResolved(resolvedUrl)}
        title="Copy resolved URL to clipboard"
        class="flex items-center gap-1 shrink-0 rounded px-2 py-0.5 text-11 text-ink-muted hover:bg-panel hover:text-ink transition-colors border border-line/40"
      >
        {#if copiedResolvedUrl}
          <Icon name="check" size={11} class="text-brand" />
          <span class="text-brand font-medium">Copied</span>
        {:else}
          <Icon name="copy" size={11} />
          <span>Copy</span>
        {/if}
      </button>
    </div>
  {/if}

  {#if curlImported}
    <div class="mx-4 mb-2 flex shrink-0 items-center gap-1.5 text-11 text-brand">
      <Icon name="check" size={12} />
      <span>Imported from cURL</span>
    </div>
  {/if}

  {#if unresolved.length > 0}
    {@const nonUrlUnresolved = unresolved.filter((u) => !urlVars.includes(u))}
    {#if nonUrlUnresolved.length > 0}
      <div class="mx-4 mb-2 flex shrink-0 items-center gap-1.5 text-11 text-warn">
        <Icon name="alert-triangle" size={12} />
        <span>
          Unresolved in headers/body/auth (“{activeEnvName()}”):
          <span class="font-mono">{nonUrlUnresolved.map((v) => `{{${v}}}`).join(", ")}</span>
        </span>
      </div>
    {/if}
  {/if}

  <!-- Request tabs -->
  <div class="flex shrink-0 items-center gap-1 border-b border-line px-4">
    {#each tabs as rt (rt.id)}
      {@const count =
        rt.id === "params"
          ? activeCount(tab.request.params)
          : rt.id === "headers"
            ? activeCount(tab.request.headers)
            : 0}
      <button
        onclick={() => (tab.reqTab = rt.id)}
        class="relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors"
        class:text-ink={tab.reqTab === rt.id}
        class:text-ink-muted={tab.reqTab !== rt.id}
      >
        {rt.label}
        {#if count > 0}
          <span class="rounded-full bg-panel-2 px-1.5 text-10 tabular-nums text-brand">
            {count}
          </span>
        {/if}
        {#if rt.id === "body" && tab.request.bodyMode !== "none"}
          <span
            class="size-1.5 rounded-full {jsonCheck && !jsonCheck.valid ? 'bg-warn' : 'bg-brand'}"
            aria-label={jsonCheck && !jsonCheck.valid ? "Invalid JSON body" : "Body set"}
          ></span>
        {/if}
        {#if rt.id === "auth" && authApplied}
          <span class="size-1.5 rounded-full bg-brand" aria-label="Auth configured"></span>
        {/if}
        {#if rt.id === "scripts" && (tab.request.preRequestScript?.trim() || tab.request.testScript?.trim())}
          <span class="size-1.5 rounded-full bg-brand" aria-label="Scripts configured"></span>
        {/if}
        {#if tab.reqTab === rt.id}
          <span class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"></span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- Request tab body -->
  <div class="min-h-0 flex-1 overflow-y-auto p-4 overscroll-contain">
    {#if tab.reqTab === "params"}
      {@render keyValueEditor(tab.request.params, "Query parameter", false, onParamsChange)}
    {:else if tab.reqTab === "headers"}
      <div class="mb-2.5 flex items-center justify-between">
        <span class="text-xs text-ink-muted">Request headers</span>
        <button
          type="button"
          onclick={addSseHeadersToActive}
          class="flex items-center gap-1.5 rounded-md border border-line bg-panel-2 px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-line-strong hover:bg-panel-3 active:scale-95"
          title="Add Accept: text/event-stream & Cache-Control: no-cache"
        >
          <Icon name="zap" size={13} class="text-amber-400" />
          <span>Add SSE Preset</span>
        </button>
      </div>
      {@render keyValueEditor(tab.request.headers, "Header", true)}
    {:else if tab.reqTab === "body"}
      <div class="space-y-3">
        <!-- Body mode selector -->
        <div role="radiogroup" aria-label="Body type" class="flex flex-wrap items-center gap-1">
          {#each bodyModes as m (m.id)}
            <button
              role="radio"
              aria-checked={tab.request.bodyMode === m.id}
              onclick={() => (tab.request.bodyMode = m.id)}
              class="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
              class:border-brand={tab.request.bodyMode === m.id}
              class:bg-brand={tab.request.bodyMode === m.id}
              class:text-slate-950={tab.request.bodyMode === m.id}
              class:border-line={tab.request.bodyMode !== m.id}
              class:text-ink-muted={tab.request.bodyMode !== m.id}
              class:hover:border-line-strong={tab.request.bodyMode !== m.id}
            >
              {m.label}
            </button>
          {/each}
        </div>

        {#if tab.request.bodyMode === "none"}
          <p class="py-6 text-center text-sm text-ink-faint">This request has no body.</p>
        {:else if tab.request.bodyMode === "json"}
          {#if jsonCheck}
            <div class="mb-2 flex items-center justify-between gap-2">
              {#if !tab.request.body.trim()}
                <span class="text-11 text-ink-faint">Enter a JSON body</span>
              {:else if jsonCheck.skipped}
                <span class="text-11 text-ink-faint">Body too large to validate</span>
              {:else if jsonCheck.valid}
                <span class="flex items-center gap-1 text-11 text-emerald-400">
                  <Icon name="check" size={12} />
                  Valid JSON
                </span>
              {:else}
                <span class="flex min-w-0 items-center gap-1 text-11 text-warn">
                  <Icon name="alert-triangle" size={12} class="shrink-0" />
                  <span class="truncate">
                    {jsonCheck.error}{jsonCheck.line
                      ? ` (line ${jsonCheck.line}, col ${jsonCheck.column})`
                      : ""}
                  </span>
                </span>
              {/if}
              <button
                onclick={formatBody}
                disabled={!tab.request.body.trim() || !jsonCheck.valid || jsonCheck.skipped}
                class="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-11 font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted"
              >
                <Icon name="zap" size={12} />
                Format
              </button>
            </div>
          {/if}
          <textarea
            bind:value={tab.request.body}
            spellcheck="false"
            placeholder={'{\n  "key": "value"\n}'}
            class="h-40 w-full resize-none rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none {jsonCheck?.valid ===
            false
              ? 'ring-1 ring-warn/50'
              : ''}"
          ></textarea>
        {:else if tab.request.bodyMode === "text"}
          <textarea
            bind:value={tab.request.body}
            spellcheck="false"
            placeholder="Raw request body"
            class="h-40 w-full resize-none rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          ></textarea>
        {:else if tab.request.bodyMode === "form"}
          {@render keyValueEditor(tab.request.formFields, "Field name")}
        {:else if tab.request.bodyMode === "multipart"}
          {@render multipartEditor()}
        {:else}
          {@render binaryPicker()}
        {/if}
      </div>
    {:else if tab.reqTab === "auth"}
      <AuthEditor bind:auth={tab.request.auth} allowInherit {inheritNote} />
    {:else if tab.reqTab === "scripts"}
      <div class="flex flex-col gap-3">
        <!-- Sub-tabs: Pre-request vs Tests -->
        <div class="flex items-center justify-between border-b border-line pb-2">
          <div class="flex items-center gap-1">
            <button
              type="button"
              onclick={() => (scriptSubTab = "prerequest")}
              class="relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              class:bg-panel-2={scriptSubTab === "prerequest"}
              class:text-ink={scriptSubTab === "prerequest"}
              class:text-ink-muted={scriptSubTab !== "prerequest"}
            >
              <span>Pre-request Script</span>
              {#if tab.request.preRequestScript?.trim()}
                <span class="ml-1.5 inline-block size-1.5 rounded-full bg-brand" aria-label="Pre-request script present"></span>
              {/if}
            </button>
            <button
              type="button"
              onclick={() => (scriptSubTab = "tests")}
              class="relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              class:bg-panel-2={scriptSubTab === "tests"}
              class:text-ink={scriptSubTab === "tests"}
              class:text-ink-muted={scriptSubTab !== "tests"}
            >
              <span>Post-response / Tests</span>
              {#if tab.request.testScript?.trim()}
                <span class="ml-1.5 inline-block size-1.5 rounded-full bg-brand" aria-label="Test script present"></span>
              {/if}
            </button>
          </div>

          <div class="flex items-center gap-2">
            {#if (scriptSubTab === "prerequest" && tab.request.preRequestScript?.trim()) || (scriptSubTab === "tests" && tab.request.testScript?.trim())}
              <button
                type="button"
                onclick={() => {
                  if (scriptSubTab === "prerequest") tab.request.preRequestScript = "";
                  else tab.request.testScript = "";
                }}
                class="flex items-center gap-1 rounded px-2 py-1 text-xs text-ink-faint transition-colors hover:text-danger"
                title="Clear current script"
              >
                <Icon name="trash" size={13} />
                Clear
              </button>
            {/if}
          </div>
        </div>

        <!-- Script description hint -->
        <p class="text-xs text-ink-faint">
          {#if scriptSubTab === "prerequest"}
            Executes JavaScript before send. Generate fake data using <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-11 text-ink">faker.*</code>, set dynamic payloads with <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-11 text-ink">rio.request.body = JSON.stringify(...)</code>, or set variables with <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-11 text-ink">rio.setEnv(key, val)</code>.
          {:else}
            Executes after the response is received. Write tests using <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-11 text-ink">rio.test()</code> and <code class="rounded bg-panel-2 px-1 py-0.5 font-mono text-11 text-ink">rio.expect()</code>, or extract variables into active environment.
          {/if}
        </p>

        <!-- Editor and Snippets grid -->
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <!-- Main script editor -->
          <div class="lg:col-span-3">
            {#if scriptSubTab === "prerequest"}
              <textarea
                bind:value={tab.request.preRequestScript}
                spellcheck="false"
                placeholder={'// Pre-request Script\n// Generate fake data payload using faker:\n// rio.request.body = JSON.stringify({\n//   name: faker.person.fullName(),\n//   email: faker.internet.email()\n// }, null, 2);\n// Or set variables: rio.setEnv("randomName", faker.person.fullName());'}
                class="h-72 w-full resize-y rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
              ></textarea>
            {:else}
              <textarea
                bind:value={tab.request.testScript}
                spellcheck="false"
                placeholder={'// Post-response / Tests Script\nrio.test("Status code is 200", function () {\n    rio.response.to.have.status(200);\n});\n\n// Extract tokens or values:\n// const data = rio.response.json();\n// rio.environment.set("auth_token", data.token);'}
                class="h-72 w-full resize-y rounded-lg border border-line bg-panel-2/60 p-3 font-mono text-13 leading-relaxed text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
              ></textarea>
            {/if}
          </div>

          <!-- Snippets palette -->
          <div class="rounded-lg border border-line bg-panel p-3">
            <h4 class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">Snippets</h4>
            <div class="flex flex-col gap-1.5">
              {#each (scriptSubTab === "prerequest" ? PRE_REQUEST_SNIPPETS : TEST_SNIPPETS) as snippet (snippet.name)}
                <button
                  type="button"
                  onclick={() => insertSnippet(snippet.code)}
                  title={snippet.description}
                  class="group flex flex-col items-start rounded-md border border-line/60 bg-panel-2/40 p-2 text-left transition-colors hover:border-brand/50 hover:bg-panel-2"
                >
                  <span class="text-xs font-medium text-ink group-hover:text-brand">{snippet.name}</span>
                  <span class="line-clamp-1 text-10 text-ink-faint">{snippet.description}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if tab.reqTab === "settings"}
      <div class="max-w-xl space-y-4">
        <div class="flex items-start justify-between gap-4 rounded-lg border border-line bg-panel p-3.5">
          <div>
            <label for="cookie-jar" class="text-sm font-medium text-ink">
              Automatic Cookie Jar & Session Persistence
            </label>
            <p class="mt-0.5 text-xs text-ink-faint">
              Automatically captures Set-Cookie headers and attaches matching cookies to subsequent domain calls.
            </p>
          </div>
          <input
            id="cookie-jar"
            type="checkbox"
            bind:checked={tab.request.useCookieJar}
            class="mt-1 size-4 accent-brand cursor-pointer"
          />
        </div>

        <div class="flex items-start justify-between gap-4 rounded-lg border border-line bg-panel p-3.5">
          <div>
            <label for="ssl-verify" class="text-sm font-medium text-ink">
              Allow self-signed or invalid SSL/TLS certificates
            </label>
            <p class="mt-0.5 text-xs text-ink-faint">
              Bypasses TLS validation errors for self-signed certificates or local development.
            </p>
          </div>
          <input
            id="ssl-verify"
            type="checkbox"
            bind:checked={tab.request.dangerAcceptInvalidCerts}
            class="mt-1 size-4 accent-brand cursor-pointer"
          />
        </div>

        <div class="rounded-lg border border-line bg-panel p-3.5 space-y-2">
          <label for="req-timeout" class="block text-sm font-medium text-ink">
            Request timeout (milliseconds)
          </label>
          <p class="text-xs text-ink-faint">
            Maximum time to wait before timing out (default is 30,000 ms / 30 seconds). Leave empty for default.
          </p>
          <input
            id="req-timeout"
            type="number"
            min="100"
            step="100"
            placeholder="30000"
            bind:value={tab.request.timeoutMs}
            class="w-48 rounded-md border border-line bg-panel-2 px-3 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none"
          />
        </div>
      </div>
    {/if}
  </div>

  {#if sug}
    <ul
      role="listbox"
      aria-label="Header suggestions"
      style="position: fixed; left: {sug.left}px; top: {sug.top}px; min-width: {sug.width}px"
      class="z-50 max-h-56 overflow-y-auto rounded-md border border-line bg-panel py-1 shadow-2xl shadow-black/40"
    >
      {#each sug.items as item, i (item)}
        <li role="option" aria-selected={i === sug.index}>
          <button
            type="button"
            onmousedown={(e) => {
              e.preventDefault();
              chooseSuggest(item);
            }}
            onmouseenter={() => {
              if (sug) sug.index = i;
            }}
            class="flex w-full items-center px-3 py-1 text-left font-mono text-xs transition-colors {i ===
            sug.index
              ? 'bg-panel-2 text-ink'
              : 'text-ink-muted'}"
          >
            {item}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if codeOpen}
  {#await import("./CodeDialog.svelte") then { default: CodeDialog }}
    <CodeDialog bind:open={codeOpen} />
  {/await}
{/if}

{#snippet keyValueEditor(list: KeyValue[], label: string, suggest = false, onChange?: () => void)}
  <div class="overflow-hidden rounded-lg border border-line">
    <div
      class="grid grid-kv items-stretch border-b border-line bg-panel-2/50 text-11 font-medium tracking-wide text-ink-faint uppercase"
    >
      <span></span>
      <span class="border-l border-line px-2.5 py-1.5">Key</span>
      <span class="border-l border-line px-2.5 py-1.5">Value</span>
      <span class="border-l border-line"></span>
    </div>
    {#each list as row (row.id)}
      <div
        class="grid grid-kv items-stretch border-b border-line/60 last:border-b-0 hover:bg-panel-2/30"
      >
        <input
          type="checkbox"
          bind:checked={row.enabled}
          onchange={onChange}
          aria-label="Enable row"
          class="size-3.5 place-self-center accent-brand cursor-pointer"
        />
        <input
          bind:value={row.key}
          oninput={(e) => {
            ensureTrailingRow(list);
            onChange?.();
            if (suggest) openSuggest(row, list, e.currentTarget);
          }}
          onfocus={(e) => {
            if (suggest) openSuggest(row, list, e.currentTarget);
          }}
          onkeydown={(e) => {
            if (suggest) suggestKeydown(e);
          }}
          onblur={() => {
            if (suggest) sug = null;
          }}
          placeholder={label}
          spellcheck="false"
          class="grid-input w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
        />
        <VarInput
          bind:value={row.value}
          oninput={() => {
            ensureTrailingRow(list);
            onChange?.();
          }}
          placeholder="Value"
          containerClass="h-full"
          class="grid-input h-full w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
        />
        <div class="flex items-center justify-center border-l border-line">
          <button
            onclick={() => {
              removeRow(list, row.id);
              onChange?.();
            }}
            aria-label="Remove row"
            class="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    {/each}
  </div>
  <div class="mt-3 flex items-center justify-between">
    <button
      onclick={() => {
        addRow(list);
        onChange?.();
      }}
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
    >
      <Icon name="plus" size={14} />
      Add row
    </button>
    {#if list.some((r) => r.key || r.value)}
      <button
        onclick={() => {
          clearRows(list);
          onChange?.();
        }}
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-danger"
      >
        <Icon name="trash" size={13} />
        Clear all
      </button>
    {/if}
  </div>
{/snippet}

{#snippet multipartEditor()}
  <div class="overflow-hidden rounded-lg border border-line">
    <div
      class="grid grid-multipart items-stretch border-b border-line bg-panel-2/50 text-11 font-medium tracking-wide text-ink-faint uppercase"
    >
      <span></span>
      <span class="border-l border-line px-2.5 py-1.5">Key</span>
      <span class="border-l border-line px-2.5 py-1.5">Type</span>
      <span class="border-l border-line px-2.5 py-1.5">Value</span>
      <span class="border-l border-line"></span>
    </div>
    {#each tab.request.multipart as row (row.id)}
      <div
        class="grid grid-multipart items-stretch border-b border-line/60 last:border-b-0 hover:bg-panel-2/30"
      >
        <input
          type="checkbox"
          bind:checked={row.enabled}
          aria-label="Enable field"
          class="size-3.5 place-self-center accent-brand"
        />
        <input
          bind:value={row.key}
          oninput={() => ensureTrailingMultipart(tab.request.multipart)}
          placeholder="Field name"
          spellcheck="false"
          class="grid-input w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
        />
        <button
          onclick={() => (row.kind = row.kind === "text" ? "file" : "text")}
          class="flex items-center justify-center gap-1 border-l border-line text-11 font-medium text-ink-muted transition-colors hover:bg-panel-2 hover:text-ink"
          title="Toggle text / file field"
        >
          <Icon name={row.kind === "file" ? "file" : "copy"} size={12} />
          {row.kind === "file" ? "File" : "Text"}
        </button>
        {#if row.kind === "file"}
          <button
            onclick={() => chooseMultipartFile(row)}
            class="flex items-center gap-1.5 truncate border-l border-line px-2.5 py-1.5 text-left text-13 transition-colors hover:bg-panel-2"
            class:text-ink={row.filePath}
            class:text-ink-faint={!row.filePath}
            title={row.filePath || "Choose a file"}
          >
            <Icon name="upload" size={13} class="shrink-0 text-ink-faint" />
            <span class="truncate font-mono">{row.filePath ? baseName(row.filePath) : "Choose file…"}</span>
          </button>
        {:else}
          <VarInput
            bind:value={row.value}
            oninput={() => ensureTrailingMultipart(tab.request.multipart)}
            placeholder="Value"
            containerClass="h-full"
            class="grid-input h-full w-full border-l border-line bg-transparent px-2.5 py-1.5 font-mono text-13 text-ink placeholder:text-ink-faint focus:z-10 focus:ring-1 focus:ring-inset focus:ring-brand/60 focus:outline-none"
          />
        {/if}
        <div class="flex items-center justify-center border-l border-line">
          <button
            onclick={() => removeMultipart(tab.request.multipart, row.id)}
            aria-label="Remove field"
            class="grid size-6 place-items-center rounded text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>
    {/each}
  </div>
  <div class="mt-3 flex items-center justify-between">
    <button
      onclick={() => addMultipart(tab.request.multipart)}
      class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-brand"
    >
      <Icon name="plus" size={14} />
      Add field
    </button>
    {#if tab.request.multipart.some((r) => r.key || r.value || r.filePath)}
      <button
        onclick={() => clearMultipart(tab.request.multipart)}
        class="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ink-faint transition-colors hover:text-danger"
      >
        <Icon name="trash" size={13} />
        Clear all
      </button>
    {/if}
  </div>
{/snippet}

{#snippet binaryPicker()}
  <div class="flex flex-col gap-2 py-2">
    {#if tab.request.binaryPath}
      <div class="flex items-center gap-2 rounded-lg border border-line bg-panel-2/50 px-3 py-2.5">
        <Icon name="file" size={16} class="shrink-0 text-brand" />
        <span class="min-w-0 flex-1 truncate font-mono text-13 text-ink" title={tab.request.binaryPath}>
          {baseName(tab.request.binaryPath)}
        </span>
        <button
          onclick={chooseBinaryFile}
          class="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong"
        >
          Change
        </button>
        <button
          onclick={() => (tab.request.binaryPath = "")}
          aria-label="Remove file"
          class="grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger"
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    {:else}
      <button
        onclick={chooseBinaryFile}
        class="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line py-6 text-sm font-medium text-ink-muted transition-colors hover:border-brand/60 hover:text-ink"
      >
        <Icon name="upload" size={16} />
        Choose a file…
      </button>
    {/if}
    <p class="text-11 leading-relaxed text-ink-faint">
      Sent as the raw request body (<span class="font-mono">application/octet-stream</span> unless a
      Content-Type header is set). The file is read at send time and never stored in the collection.
    </p>
  </div>
{/snippet}

<!-- Shown in the Auth tab when the request inherits from a folder/collection. -->
{#snippet inheritNote()}
  <div class="rounded-lg border border-line bg-panel-2/40 px-3 py-4 text-center">
    {#if inheritedFrom}
      <p class="text-sm text-ink-muted">
        Inherits <span class="font-medium text-ink">{AUTH_LABELS[inheritedFrom.type] ?? inheritedFrom.type}</span>
        from <span class="font-medium text-ink">{inheritedFrom.name}</span>.
      </p>
      <p class="mt-1 text-11 text-ink-faint">Set auth on this folder/collection to change it for everything inside.</p>
    {:else}
      <p class="text-sm text-ink-muted">No auth set on any parent folder or collection.</p>
      <p class="mt-1 text-11 text-ink-faint">This request is sent without authorization.</p>
    {/if}
  </div>
{/snippet}
