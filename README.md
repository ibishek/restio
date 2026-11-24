<div align="center">

# ⚡ RestIO

**A fast, shareable REST API client for your desktop.**

Compose, send, and organize HTTP requests — then share entire collections
with your team. Postman-like, but a lightweight native app that keeps your
work with you.

<br/>

[![CodeQL](https://github.com/ibishek/restio/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/ibishek/restio/actions/workflows/github-code-scanning/codeql)
![Tauri](https://img.shields.io/badge/Tauri-2.12-24C8DB?logo=tauri&logoColor=white)
![Svelte](https://img.shields.io/badge/Svelte-5.58-FF3E00?logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4.3-06B6D4?logo=tailwindcss&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-backend-000000?logo=rust&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

<img width="1983" height="793" alt="restio-banner" src="https://github.com/user-attachments/assets/0ef70b89-4db5-4717-ba22-777e340d3849" />

---

## Overview

**RestIO** is a cross-platform desktop app for working with REST APIs. It
does what you'd expect from an API client — build requests, manage headers and
auth, inspect responses — with one defining feature: **API collections can be
shared across users**, so a team can author and reuse the same requests together.

Because it's a native app, requests execute in a **Rust backend** rather than a
browser sandbox — no CORS limits, no forbidden headers, full control over the
wire.

> **Status:** in active development. Working today: the **workbench UI** (collections
> sidebar, request builder, response viewer), a real **Rust HTTP engine**
> (`send_request`) with **cancellation**, **local persistence** in SQLite & atomic JSON,
> **cross-user sharing via Git**, **workspaces**, **multi-environment variables**,
> **real-time resolved URL previews**, **automated collection runner**, **pre/post script runner**,
> **send history**, and **16-target code generation**.

## Features

- 🚀 **Full-power HTTP** — requests run in Rust (`reqwest`); set any header, hit any host, no CORS limits
- ⚡ **SSE & LLM Stream Viewer** — real-time Server-Sent Events (`text/event-stream`) inspector with dual views: auto-token accumulator for OpenAI, Anthropic, Gemini, Ollama, and DeepSeek, plus a filterable chronological SSE event timeline with TTFT and throughput metrics
- 🍪 **Automatic Cookie Jar & Session Persistence** — zero-config `Set-Cookie` capturing and RFC 6265 domain/path matching persisted per-workspace in SQLite, with an interactive cookie manager and response cookies inspector
- 📡 **WebSocket Client (`ws://`, `wss://`)** — native bidirectional real-time client powered by `tokio-tungstenite` with frame inspection (inbound/outbound/ping/pong), JSON/text/binary composers, auto-reconnect, and live RTT latency tracking
- 🛑 **Cancellable** — abort in-flight requests at any time with native abort handles
- 📁 **Collections & Workspaces** — organize requests with nested folders and base URL inheritance
- 🤝 **Git-backed Sharing** — publish, pull, and collaborate on collections via Git without leaking secrets
- 🌱 **Environments & Variables** — substitute `{{base_url}}`, `{{token}}` with inline autocompletion and hover value tooltips
- 🌐 **Resolved URL Preview** — real-time evaluation preview showing the exact interpolated URL with 1-click clipboard copy
- 🕑 **Send History** — local per-workspace request log with status, size, and timing
- 📜 **Code Generation** — export requests to cURL, Fetch, Python, Go, and 12+ other languages
- 📥 **Postman Interchange** — two-way import/export for Postman v2.1 collections and environments
- 📄 **OpenAPI & Swagger** — import and export OpenAPI 3.0, 3.1, and Swagger 2.0 specs (YAML & JSON) with schema synthesis
- 🧪 **Scripts & Test Runner** — Pre-request and post-response testing using the `rio` API (`rio.setEnv`, `rio.test`, `rio.expect`, `rio.response`) with snippets and assertion reporting
- 🎲 **Integrated Mock Data** — built-in `@faker-js/faker` for generating realistic fake payloads and test data in scripts
- 🏃 **Collection Runner** — automated multi-request test suites with request chaining, iteration counts, delays, stop-on-failure, and exportable run summaries
- ⚡ **Command Palette (`⌘K`)** — global search across requests, history, environments, and commands with quick filter prefixes (`>`, `/`, `env:`, `hist:`, `ws:`)
- ✨ **Developer Iconography** — crisp developer-oriented icons powered by `@lucide/svelte`
- 🔒 **TLS & Timeouts** — toggle self-signed certificate validation and custom request timeouts
- 🎨 **Native & Fast** — lightweight Tauri v2 shell, first-class dark mode, responsive keyboard shortcuts

## Tech Stack

| Layer           | Technology                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Desktop shell   | [Tauri v2](https://v2.tauri.app/) (`@tauri-apps/api` 2.12, Rust)                                                  |
| Frontend        | [SvelteKit](https://svelte.dev/) (Svelte 5 runes, SPA static adapter)                                             |
| Language        | TypeScript 6.0 (strict mode)                                                                                      |
| Styling         | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite` 4.3)                                             |
| HTTP engine     | Rust [reqwest](https://docs.rs/reqwest) (rustls-tls, http2, brotli, gzip, deflate, multipart)                     |
| Local database  | Rust [rusqlite](https://docs.rs/rusqlite) (bundled SQLite 3)                                                      |
| Iconography     | [@lucide/svelte](https://lucide.dev/guide/packages/lucide-svelte)                                                 |
| Mock Data       | [@faker-js/faker](https://fakerjs.dev/)                                                                           |
| Specification   | [yaml](https://eemeli.org/yaml/) (OpenAPI YAML/JSON parsing & synthesis)                                          |
| Tooling         | [Vite 8](https://vite.dev/), [Vitest 5](https://vitest.dev/), [oxlint](https://oxc.rs/), [oxfmt](https://oxc.rs/) |
| Package manager | [pnpm](https://pnpm.io/)                                                                                          |

## Prerequisites

You'll need these installed before setup:

- **Node.js `v26.2.0`** — pinned in [`.nvmrc`](./.nvmrc). With [nvm](https://github.com/nvm-sh/nvm): `nvm use`
- **pnpm** — `npm install -g pnpm` (or see [pnpm.io/installation](https://pnpm.io/installation))
- **Rust toolchain** — install via [rustup.rs](https://rustup.rs/) (edition 2021)
- **Tauri system dependencies** — platform-specific (WebView, build tools).
  Follow the official guide: [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/)

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Launch the desktop app in development
pnpm tauri dev
```

`pnpm tauri dev` builds the Rust backend and opens the app in a native window
with hot-reload for the frontend. First run compiles Rust and may take a few
minutes; later runs are fast.

## Scripting & Testing (`rio.*` / `io.*`)

RestIO includes a sandboxed JavaScript runtime for automating workflows and verifying responses before and after requests are sent.

### Execution Lifecycle

1. **Pre-request Scripts** run before outbound request composition. Any variables set via `rio.setEnv()` or `rio.environment.set()` are immediately applied to the active environment and interpolated into `{{variable}}` tokens across the URL, query parameters, headers, and request body.
2. **HTTP Request** is executed through the native Rust engine.
3. **Post-response / Tests Scripts** run after response headers and payload arrive. Tests assert response codes, body fields, and timing, or extract authentication tokens for subsequent requests.
4. **Test Results** are reported in the response panel with pass/fail counts, assertion errors, and console logs.

### API Reference

| Object / Method                                | Description                                  | Example                                                                    |
| :--------------------------------------------- | :------------------------------------------- | :------------------------------------------------------------------------- |
| `rio.environment.set(key, val)`                | Set an active environment variable           | `rio.environment.set("token", "xyz");`                                     |
| `rio.setEnv(key, val)`                         | Shorthand alias to set a variable            | `rio.setEnv("user_id", 42);`                                               |
| `rio.environment.get(key)` / `rio.getEnv(key)` | Read variable value                          | `const id = rio.getEnv("user_id");`                                        |
| `rio.environment.has(key)`                     | Check if variable exists                     | `if (rio.environment.has("token")) { ... }`                                |
| `rio.environment.unset(key)`                   | Clear an environment variable                | `rio.environment.unset("temp");`                                           |
| `rio.test(name, fn)`                           | Register synchronous or async test           | `rio.test("Status 200", () => { ... });`                                   |
| `rio.expect(actual)`                           | Chai-compatible assertion builder            | `rio.expect(res.success).to.be.true;`                                      |
| `rio.response.code`                            | HTTP status code (numeric)                   | `rio.expect(rio.response.code).to.equal(200);`                             |
| `rio.response.status`                          | HTTP status text (string)                    | `rio.expect(rio.response.status).to.equal("OK");`                          |
| `rio.response.responseTime`                    | Round-trip duration in milliseconds          | `rio.expect(rio.response.responseTime).to.be.below(500);`                  |
| `rio.response.headers.get(name)`               | Inspect response header (case-insensitive)   | `rio.expect(rio.response.headers.get("content-type")).to.include("json");` |
| `rio.response.json()`                          | Parse response body as JSON                  | `const data = rio.response.json();`                                        |
| `rio.response.text()`                          | Raw response body string                     | `const body = rio.response.text();`                                        |
| `rio.response.to.have.status(code)`            | Status code assertion                        | `rio.response.to.have.status(200);`                                        |
| `rio.response.to.have.header(name, val?)`      | Header presence/value assertion              | `rio.response.to.have.header("x-request-id");`                             |
| `rio.response.to.be.success`                   | Assert 2xx status code                       | `rio.response.to.be.success;`                                              |
| `rio.response.to.be.clientError`               | Assert 4xx status code                       | `rio.response.to.be.clientError;`                                          |
| `rio.response.to.be.serverError`               | Assert 5xx status code                       | `rio.response.to.be.serverError;`                                          |
| `faker.*` / `rio.faker.*`                      | Generate realistic fake mock data            | `faker.person.fullName();`, `faker.internet.email();`                      |
| `rio.request.body = ...`                       | Dynamically set outgoing request body        | `rio.request.body = JSON.stringify(fakePayload);`                          |
| `console.log(...)`                             | Output debug message to Test Results console | `console.log("Token extracted:", token);`                                  |

> **Compatibility:** `rio` is the primary namespace. `io`, `am`, and `pm` (Postman compatibility) are also provided as automatic aliases in every script.

### Common Script Examples

**Pre-request: Dynamic Fake Payloads with Faker**

```javascript
// Generate realistic fake user payload
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

// Option 1: Send payload directly as the outbound request body
rio.request.body = JSON.stringify(fakeUser, null, 2);

// Option 2: Or set individual fake variables for {{name}}, {{email}} interpolation
rio.setEnv("fakeName", faker.person.fullName());
rio.setEnv("fakeEmail", faker.internet.email());
```

**Pre-request: Dynamic Timestamp & Auth Setup**

```javascript
// Generate dynamic unix timestamp
rio.setEnv("timestamp", Date.now().toString());

// Generate dynamic UUID
rio.setEnv("nonce", crypto.randomUUID());
```

**Post-response: Assert Status, Parse Body, and Persist Token**

```javascript
// 1. Assert status code
rio.test("Status is 200 OK", function () {
  rio.response.to.have.status(200);
});

// 2. Validate JSON payload and extract token
rio.test("Token is returned and valid", function () {
  const data = rio.response.json();
  rio.expect(data).to.have.property("token");
  rio.expect(data.roles).to.be.an("array").and.to.include("admin");

  // Persist token for subsequent requests
  rio.setEnv("auth_token", data.token);
});

// 3. Check performance
rio.test("Response time under 300ms", function () {
  rio.expect(rio.response.responseTime).to.be.below(300);
});
```

### Automated Collection Runner

Run entire collections or folders sequentially as an automated integration test suite:

- **Launch**: Click `Run collection` or `Run folder` from the container context menu or header.
- **Queue Controls**: Reorder requests, toggle individual endpoints, and select the target environment.
- **Configurable Runs**: Set iteration count (repeat test cycles), inter-request delay (`delayMs`), and toggle "Stop run on first failed test".
- **Dynamic Chaining**: Variables extracted in step 1 via `rio.setEnv()` immediately interpolate into subsequent requests.
- **Live Reporting**: Watch live progress with 4 KPI cards (requests run, tests passed/failed, duration, average latency) and expandable assertion logs.
- **Export Summary**: Export structured test reports to clipboard as JSON.

### OpenAPI & Swagger Specification Support

RestIO provides full two-way compatibility with OpenAPI and Swagger specifications:

- **Universal Format Support**: Imports and exports both **YAML** and **JSON** specs seamlessly with zero third-party cloud dependencies.
- **Version Coverage**: Supports **OpenAPI 3.1.x**, **OpenAPI 3.0.x**, and **Swagger 2.0**.
- **Real-Time Inspection & Validation**: As you paste or drop a file, the inspector dynamically detects the format version, displays the API title, and counts all HTTP endpoints.
- **Schema-to-Sample Synthesis**: Automatically resolves `$ref` schemas, object structures, arrays, combinators (`allOf`, `oneOf`, `anyOf`), and primitives to populate realistic sample JSON request bodies.
- **Path & Parameter Mapping**: Translates `{id}` path parameters to `{{id}}` variable placeholders for instant environment interpolation, and imports query strings, headers, and form-data fields.
- **Auth Scheme Conversion**: Converts OpenAPI security schemes (Bearer tokens, Basic auth, API keys in headers/query) to RestIO collection and request authentication.
- **Export to OpenAPI 3.1.0**: Converts any RestIO collection into standard OpenAPI 3.1.0 in either YAML or JSON with 1-click clipboard copy or direct file download.

### Command Palette & Global Search (`⌘K` / `Ctrl+K`)

RestIO includes a Spotlight-style keyboard-first Command Palette accessible anytime with `⌘K` (macOS) or `Ctrl+K` (Linux/Windows):

- **Jump to Requests**: Search across all collections and nested folders with instant method badges (`GET`, `POST`, etc.) and breadcrumb trails. Press `Enter` to open.
- **Search History**: Search recent sends with HTTP response statuses, durations, and timestamps.
- **Switch Environments**: Quickly activate any environment or clear active variables without leaving your keyboard.
- **Run Commands**: Execute workbench actions: "New request", "Send request", "Run automated test suite", "Export OpenAPI", "Import Postman", "Toggle sidebar", and "Keyboard shortcuts".
- **Category Filter Prefixes**:
  - `>` or `cmd:` — Commands only
  - `/` or `req:` — Requests only
  - `hist:` — History only
  - `env:` — Environments only
  - `ws:` — Workspaces only
- **Keyboard Navigation**: Use `↑` / `↓` arrows to navigate with automatic scrolling, `↵` to select/execute, and `esc` to dismiss.

### Real-Time Resolved URL & Variable Inspection

When authoring requests with environment variables (`{{base_url}}`, `{{token}}`, `{{id}}`) or folder base URL prefixes:

- **Resolved URL Preview Bar**: RestIO dynamically evaluates the final outbound URL and displays it in a dedicated preview banner immediately below the URL bar.
- **1-Click Copy**: Copy the concrete, fully resolved URL to your clipboard with a single click.
- **Inline Variable Autocomplete**: Typing `{{` in URL or header inputs opens an autocomplete popup showing variable names and their current active values.
- **Hover Value Tooltips**: Hover over any highlighted `{{var}}` pill to inspect its resolved value directly in the editor.

### Universal Modal Focus Trapping & Accessibility

All 11 modal dialogs (Command Palette, Environment Editor, Collection Runner, OpenAPI / Postman dialogs, Code Export, Shortcuts, Workspaces, and Share) implement accessible keyboard management via `use:focusTrap`:

- **Strict Focus Containment**: `Tab` and `Shift+Tab` cycle strictly through focusable elements within the active dialog, wrapping seamlessly without escaping to background surfaces.
- **Border-Hugging Focus Affordance**: Buttons, filter chips, and interactive elements feature crisp, inset focus outlines (`outline: 1.5px solid var(--color-brand); outline-offset: -1px`) that prevent clipping inside scroll containers.
- **Focus Restoration**: Automatically returns keyboard focus to the triggering element upon dialog closure.

## Scripts

| Command            | What it does                                                    |
| ------------------ | --------------------------------------------------------------- |
| `pnpm tauri dev`   | **Primary dev loop** — launches the desktop app with hot reload |
| `pnpm tauri build` | Produce distributable desktop bundles for the current platform  |
| `pnpm dev`         | Run the frontend only in a browser at `http://localhost:1420`   |
| `pnpm build`       | Build the static frontend into `build/` (consumed by Tauri)     |
| `pnpm test`        | Run unit tests with vitest                                      |
| `pnpm check`       | Type-check the project (`svelte-kit sync` + `svelte-check`)     |

> **Note:** run the app with `pnpm tauri dev`, not `pnpm dev` alone — the
> backend and its IPC only exist inside the Tauri shell. `pnpm dev` in a browser
> is for pure UI work and can't send real requests.

## Code Quality

Both stacks are formatted and linted. JS/TS use [**oxfmt**](https://oxc.rs/)
(formatter) and [**oxlint**](https://oxc.rs/docs/guide/usage/linter.html)
(linter); Rust uses **rustfmt** and **clippy**. Configs live in `.oxfmtrc.json`,
`.oxlintrc.json`, and `src-tauri/rustfmt.toml`.

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `pnpm format`       | Format JS/TS/JSON/Markdown in place (oxfmt)                     |
| `pnpm format:check` | Check formatting without writing (CI-safe)                      |
| `pnpm lint`         | Lint the frontend (oxlint)                                      |
| `pnpm lint:fix`     | Lint and auto-fix                                               |
| `pnpm fmt:rust`     | Format Rust (`cargo fmt`)                                       |
| `pnpm lint:rust`    | Lint Rust with clippy (`-D warnings`; compiles — slow cold run) |
| `pnpm format:all`   | Format both stacks                                              |
| `pnpm lint:all`     | Lint both stacks                                                |
| `pnpm verify`       | Fast gate: format check + lint + rustfmt check + type check     |

**Run `pnpm verify` before you consider a change done**, and `pnpm lint:rust`
as well when you've touched Rust.

**Coverage notes:**

- oxfmt/oxlint cover `.js`, `.ts`, and `.svelte.ts`. oxlint also lints
  `<script>` blocks inside `.svelte` files, but **oxfmt does not format
  `.svelte` templates** (no `.svelte` formatter is wired up yet).
- oxfmt also formats Markdown and JSON. The vendored, hash-locked skills under
  `.agents/` are intentionally excluded — leave that ignore in place.

## Project Structure

```
restio/
├── src/                 # SvelteKit frontend (the UI)
│   ├── routes/          # pages & layouts
│   └── lib/             # features, state, IPC client, types
├── src-tauri/           # Rust backend (HTTP engine, storage, sync)
│   ├── src/             # main.rs (thin) + lib.rs (app logic)
│   └── capabilities/    # Tauri permission grants
├── static/              # static assets
├── ARCHITECTURE.md      # ← the architecture blueprint (read before coding)
└── CLAUDE.md            # guidance for AI-assisted development
```

For the full layer model, folder conventions, and the IPC contract, see
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layers, structure, IPC contract, naming rules
- [`BACKLOG.md`](./BACKLOG.md) — prioritized product backlog & feature roadmap
- [`CLAUDE.md`](./CLAUDE.md) — project overview & conventions for AI tooling

## Contributing

**Keep this README current — treat documentation as part of the change, not an
afterthought.** When you add or alter something that another developer needs to
know to run, build, or reason about the project, update the docs in the same
change:

- **New dependency, tool, or required env var** → add it to _Prerequisites_.
- **New or changed `package.json` script** → update the _Scripts_ or
  _Code Quality_ table.
- **New top-level folder or moved module** → update _Project Structure_.
- **New capability or shipped feature** → update _Features_ (and drop its
  _(planned)_ tag once it's real).
- **Architectural decision or convention** → record it in
  [`ARCHITECTURE.md`](./ARCHITECTURE.md); link it from here if users need it.

Rule of thumb: if a teammate would be surprised or blocked without knowing it,
it belongs in the README. Before opening a PR, run `pnpm verify` and confirm the
docs still match reality.

## License

[MIT](./LICENSE)
