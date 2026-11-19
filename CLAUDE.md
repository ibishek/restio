# CLAUDE.md

Guidance for Claude Code when working in this repository.

> **Read [ARCHITECTURE.md](./ARCHITECTURE.md) before writing code.** It defines
> the layer model, folder structure, IPC contract, and naming rules that every
> change must follow.

## What this project is

**RestIO** (crate: `restio`, app identifier: `com.ibishek.restio`) is a Postman-like REST API client built as a cross-platform
**desktop app**. The defining feature is that **API collections can be shared
across different users** — not just a personal request tool, but a collaborative
one where teams author, organize, and reuse HTTP requests together.

The project is actively developed: the workbench UI, a real Rust HTTP engine
(`send_request`) with cancellation, local SQLite persistence, Git-based collection
sharing, multi-environment variable resolution, and Postman interchange are live.

## Tech Stack

| Layer           | Choice                            | Notes                                                                                       |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------- |
| Shell           | **Tauri v2** (`src-tauri/`, Rust) | Desktop app; `identifier: com.ambition.restio`                                              |
| Frontend        | **SvelteKit** (Svelte 5, runes)   | SPA mode via `adapter-static` (`fallback: index.html`), `ssr = false`                       |
| Language        | **TypeScript** (strict)           | `checkJs` on, bundler module resolution                                                     |
| Styling         | **Tailwind CSS v4**               | Imported via `@import "tailwindcss"` in `src/routes/app.css`; wired through the Vite plugin |
| Package manager | **pnpm**                          | `pnpm-workspace.yaml` present; Node pinned to `v24.16.0` (`.nvmrc`)                         |
| Build           | **Vite 6**                        | Dev server locked to port **1420** (Tauri expects it)                                       |

## Commands

```bash
pnpm install            # install deps (uses pnpm, not npm/yarn)

pnpm tauri dev          # ← primary dev loop: launches the desktop app
                        #   (runs `pnpm dev` for the frontend under the hood)
pnpm dev                # frontend-only in a browser at http://localhost:1420

pnpm tauri build        # produce distributable desktop bundles

pnpm check              # svelte-kit sync + svelte-check (type check) — run before done
pnpm build              # build the static frontend into ../build (consumed by Tauri)
```

### Formatting & linting

JS/TS use **oxfmt** (formatter) + **oxlint** (linter). Rust uses **rustfmt** +
**clippy**. Configs: `.oxfmtrc.json`, `.oxlintrc.json`, `src-tauri/rustfmt.toml`.

```bash
pnpm format             # oxfmt — format JS/TS/JSON/Markdown in place
pnpm format:check       # oxfmt --check (CI-safe, no writes)
pnpm lint               # oxlint over the frontend
pnpm lint:fix           # oxlint --fix
pnpm fmt:rust           # cargo fmt (src-tauri)
pnpm lint:rust          # cargo clippy -D warnings (compiles — slow first run)
pnpm format:all         # oxfmt + cargo fmt
pnpm lint:all           # oxlint + clippy
pnpm verify             # format:check + lint + fmt:rust:check + svelte-check (fast gate)
```

Coverage & gotchas:

- oxfmt/oxlint handle `.js`, `.ts`, and `.svelte.ts`. **oxlint** also lints
  `<script>` blocks inside `.svelte`; **oxfmt does NOT format `.svelte`
  templates** — there is no formatter for `.svelte` markup here yet.
- oxfmt also formats Markdown/JSON. The vendored, hash-locked `.agents/` skills
  are excluded from it on purpose — don't remove that ignore.
- `pnpm verify` is the quick gate (no compile). Run `pnpm lint:rust` separately
  when touching Rust — clippy compiles the crate and is slow on a cold `target/`.

## Architecture

```
src/                      # SvelteKit frontend (the entire UI)
  app.html                # shell; SPA mount point
  routes/
    +layout.ts            # ssr = false (SPA — client-only)
    +page.svelte          # thin route — renders <Workbench />
    app.css               # Tailwind entry + design tokens (@theme)
  lib/
    components/ui/        # shared primitives (Icon, …)
    features/workbench/   # first feature slice: sidebar + request + response
    ipc/                  # typed invoke() wrappers — the ONLY @tauri-apps import
    types/                # domain types (single source of truth)
src-tauri/                # Rust backend
  src/
    main.rs               # thin — only calls restio_lib::run()
    lib.rs                # builder: manage(state) + generate_handler!
    commands/             # #[tauri::command] adapters (requests, store)
    http/executor.rs      # the reqwest HTTP engine (has network tests)
    store/                # collections persisted as JSON in app_data_dir
    state.rs              # RequestRegistry — run-id → AbortHandle (cancellation)
    models/               # serde structs mirroring #lib/types
    error.rs              # AppError (Serialize → crosses IPC as a string)
  capabilities/default.json  # permission grants (deny-by-default in v2)
  tauri.conf.json         # window config, build hooks, bundle
  Cargo.toml
static/                   # static assets served as-is
.agents/skills/           # vendored skills (see below); tracked by skills-lock.json
build/                    # generated frontend output (gitignored)
```

**Frontend ↔ backend boundary:** the Svelte UI talks to Rust via Tauri IPC —
`invoke('command_name', {...})` from `@tauri-apps/api/core`, events via
`@tauri-apps/api/event`. Every Rust command must be registered in
`tauri::generate_handler![...]` in `lib.rs` or it silently fails at runtime.

## Domain model (target)

Build the client around these entities. Prefer modeling them once in TypeScript
(`src/lib/types.ts`) and mirroring in Rust structs where they cross the IPC line.

- **Request** — method, URL, headers, query params, body (JSON/form/raw/binary),
  auth config. The atomic unit.
- **Collection** — an ordered, foldered tree of Requests. The unit that gets
  **shared** between users.
- **Environment** — named sets of variables (`{{base_url}}`, `{{token}}`)
  resolved into requests at send time. Keep secrets out of shared collections.
- **Response** — status, headers, timing, size, body; feeds the response viewer.
- **History** — per-user log of sent requests (local, not shared).
- **Workspace** — top-level container grouping collections + environments +
  members; the sharing scope.

## The sharing feature (core, still to be designed)

"Shared across different users" is the product's reason to exist and the biggest
open architectural decision. A Tauri app has **no server of its own**, so cross-
user sharing needs one of:

1. **Cloud sync backend** (recommended for true multi-user) — a small API +
   database (e.g. a Cloudflare Worker + D1/KV, given the skills available in this
   environment) that stores workspaces/collections and syncs them. Auth +
   membership + conflict resolution live here. Requires the Tauri **http**
   plugin.
2. **File/Git-based sharing** — export collections to a portable JSON format
   (Postman collection v2.1 compatibility is a strong default) committed to a
   shared repo. Simple, offline-friendly, no backend, but no live collaboration.
3. **Import/export only** — MVP: share by exporting/importing collection files.

When implementing, **confirm the direction with the user before building a
backend.** Whichever path is chosen: keep **secrets and environment values out
of anything that gets shared** — share request structure, not credentials.

## Local persistence

**Collections** persist today via `src-tauri/src/store/` — the whole collections
document is written as pretty JSON to `app_data_dir()/collections.json` (atomic
temp-file + rename), exposed by the `load_collections` / `save_collections`
commands and reached through `#lib/ipc/store.ts`. The store treats the document
as an **opaque `serde_json::Value`** — the frontend owns the shape, so Rust never
mirrors the collection/request types (a deliberate exception to §5's "typed both
sides"; storage doesn't interpret the data). The frontend loads on mount
(`initWorkbench`) and re-saves after any collection mutation; outside Tauri
(`pnpm dev`) both calls fail silently and the in-memory seed is used.

**Large responses** are guarded in the response viewer: bodies over ~3 MB are
never rendered (parsing/highlighting them would freeze the webview) — the UI
offers a **Download** instead, which writes the body via `save_response_body`
(→ `store::save_download`) to the OS Downloads dir and shows the path. JSON
highlighting is additionally skipped above ~512 KB (falls back to plain wrapped
text). Binary bodies are base64-decoded before writing.

Still to add: **history** and larger datasets. If search/history grows, consider
SQLite (`tauri-plugin-sql` or a Rust `rusqlite` command layer). Adding any plugin
requires its permission string in `src-tauri/capabilities/default.json` **and**
initialization in `lib.rs` — miss either and it fails silently. (The current file
store needs no plugin: Rust `std::fs` isn't gated by capabilities.)

## Request cancellation

Each send gets a fresh **run-id** (frontend `crypto.randomUUID()`). `send_request`
runs the reqwest call as a `tokio::spawn` task and registers its `AbortHandle` in
the managed `RequestRegistry` (`state.rs`) under that run-id; `cancel_request(runId)`
aborts it. An aborted join surfaces as `AppError::Cancelled`, which the UI treats
as a silent cancel (no error banner). The Send button becomes a red **Cancel**
while a request is in flight. Note: we use spawn+abort, **not `tokio::select!`** —
this environment's crate index lacks the `tokio-macros` the `macros` feature needs.

## Conventions & guardrails

**Tauri (see the `tauri-v2` skill):**

- Keep `main.rs` a thin passthrough; put all logic in `lib.rs`.
- Register every command in `generate_handler![]`.
- Commands return `Result<T, E>` (with a `Serialize`able error) for real error
  handling across IPC.
- Async commands take **owned** types (`String`, not `&str`).
- Shared mutable state → `Mutex<T>` via `.manage(...)`.
- Nothing is permitted until granted in a capability file.

**SvelteKit (see the `sveltekit-structure` skill):**

- This is a **SPA** (`ssr = false`) — no server load functions, no `+server.ts`
  endpoints; the backend is Rust, not SvelteKit. Guard browser-only code and put
  data loading in client code / `onMount`.
- Svelte 5 runes: `$props()`, `$state()`, `$derived()`, `{@render children()}`.
- Routing is file-based under `src/routes/`; use `[param]` folders and `(group)`
  folders as needed; put shared code in `src/lib` (`#lib` alias).

**UI/UX (see the `ui-ux-pro-max` skill):** invoke it before designing any screen
or component. A dev-tool like this wants a dense, keyboard-friendly, dark-mode-
capable layout (sidebar collections tree + tabbed request editor + response
pane). Non-negotiables from the skill: 44px min touch/click targets, visible
focus states, 4.5:1 contrast in both themes, SVG icons (never emoji), semantic
color tokens, tabular figures for status/timing numbers.

**Tailwind — NO arbitrary values.** Never use bracket/arbitrary utilities
(`text-[13px]`, `z-[60]`, `grid-cols-[…]`, `shadow-[…]`, `h-[34rem]`,
`max-w-[calc(...)]`, etc.). A single, unified source is easier to maintain and
reference than one-off values scattered through markup. Instead, define the
value **once** in `src/routes/app.css` and use the generated class everywhere:

- Design values (font sizes, colors, shadows, radii, spacing) → a token in
  `@theme` (e.g. `--text-13`, `--shadow-drop-indicator`). Tailwind generates the
  matching `text-13` / `shadow-drop-indicator` utility.
- Values with no `@theme` namespace (z-index, grid-template-columns, one-off
  modal/field sizing) → a named `@utility` (e.g. `z-toast`, `grid-kv`,
  `max-h-modal`).

Prefer a built-in utility when one already fits (`text-[12px]` → `text-xs`,
`scale-[0.98]` → `scale-95`). Reuse an existing token/utility before adding a
new one; name them semantically. This keeps the type scale, z-index layers, and
grid templates centralized and greppable.

## Skills available in this repo

Vendored under `.agents/skills/` and pinned in `skills-lock.json`. Read the
relevant `SKILL.md` before doing work in its area:

- **`tauri-v2`** — Rust commands, IPC, capabilities/permissions, plugins,
  config, mobile builds. Read before touching `src-tauri/`.
- **`sveltekit-structure`** — routing, layouts, error boundaries, SSR/hydration.
  Read before adding routes/layouts.
- **`ui-ux-pro-max`** — design-system generation and a large UX rule database
  (has a Python CLI at `.agents/skills/ui-ux-pro-max/scripts/search.py`). Read
  before UI work.

## Working agreements

- Use **pnpm** for all package operations.
- Run `pnpm check` before considering frontend work complete.
- Verify changes in the real app with `pnpm tauri dev`, not just a browser tab —
  IPC only exists inside the Tauri shell.
- Run `pnpm verify` before considering any task complete.
- Before building the sharing backend or adding a Tauri plugin, confirm the
  approach with the user — these are one-way-door decisions.
