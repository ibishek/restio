# ARCHITECTURE.md

The architecture blueprint for **RestIO** (`restio`). This is a set of **rules to
follow**, not a description of what exists — the repo is still a scaffold. When
you add code, make it fit this shape. When a change would violate a rule here,
stop and flag it instead of bending the rule silently.

Companion to [CLAUDE.md](./CLAUDE.md) (project overview, commands, conventions).

---

## 1. The one decision everything hangs on

**All HTTP requests execute in Rust, never in the webview.**

The webview's `fetch`/`XMLHttpRequest` is subject to CORS and forbids setting
restricted headers (`Host`, `Origin`, `Cookie`, `User-Agent`, …). An API client
that can't hit arbitrary hosts or set arbitrary headers is useless. So the send
path is:

```
Svelte UI  →  IPC client  →  invoke('send_request')  →  Rust HTTP engine (reqwest)  →  real network
```

The frontend **composes and displays** requests/responses. The Rust backend
**executes** them, persists them, and syncs them. Keep that split absolute.

---

## 2. Layer model

Five layers, dependencies point **downward only**. A layer may use the one below
it; never the reverse, never skipping the IPC seam.

```
┌─────────────────────────────────────────────────────────┐
│ 1. Routes        src/routes/**            thin, wiring only│
├─────────────────────────────────────────────────────────┤
│ 2. Features      src/lib/features/**      UI + feature logic│
├─────────────────────────────────────────────────────────┤
│ 3. State         src/lib/state/**         runes stores      │
├─────────────────────────────────────────────────────────┤
│ 4. IPC contract  src/lib/ipc/**           the ONLY invoke() │
╞═════════════════ Tauri IPC boundary ═════════════════════╡
│ 5. Backend       src-tauri/src/**         execute/store/sync│
└─────────────────────────────────────────────────────────┘
```

**Iron rule:** `invoke()`, `listen()`, `Channel` from `@tauri-apps/api` may be
imported **only** inside `src/lib/ipc/`. Everywhere else calls typed functions
from `#lib/ipc`. This keeps the entire native boundary in one auditable place and
makes the UI testable without a Tauri runtime.

---

## 3. Frontend structure (feature-sliced)

```
src/
├── routes/                      # Layer 1 — SvelteKit routing ONLY
│   ├── +layout.svelte           # app shell: sidebar | main | statusbar
│   ├── +layout.ts               # ssr = false (already set)
│   ├── +page.svelte             # redirects into the active workspace
│   └── +error.svelte            # top-level error boundary
│
├── lib/
│   ├── features/                # Layer 2 — one folder per feature slice
│   │   ├── collections/         #   sidebar tree of saved requests
│   │   │   ├── components/      #   *.svelte (PascalCase)
│   │   │   ├── collections.svelte.ts   # feature-local state (runes)
│   │   │   └── index.ts         #   public surface of the slice
│   │   ├── request-editor/      #   method+URL bar, headers, params, body, auth
│   │   ├── response-viewer/     #   status, timing, headers, pretty/raw body
│   │   ├── environments/        #   variable sets + {{var}} resolution
│   │   ├── history/             #   per-user local send log
│   │   └── sharing/             #   publish/import collections between users
│   │
│   ├── components/ui/           # design-system primitives, feature-agnostic
│   │   └── Button.svelte, Input.svelte, Tabs.svelte, Icon.svelte, …
│   │
│   ├── state/                   # Layer 3 — cross-feature app state (runes)
│   │   ├── workspace.svelte.ts  # active workspace, membership
│   │   └── ui.svelte.ts         # theme, panel sizes, open tabs
│   │
│   ├── ipc/                     # Layer 4 — the ONLY place that imports @tauri-apps
│   │   ├── client.ts            # thin invoke<T>() wrapper + error normalization
│   │   ├── requests.ts          # sendRequest(), cancelRequest()
│   │   ├── store.ts             # collections/env CRUD → backend persistence
│   │   ├── sharing.ts           # publish/pull/import
│   │   └── events.ts            # listen()/Channel wrappers (progress, sync)
│   │
│   ├── types/                   # single source of truth for domain shapes
│   │   └── index.ts             # Request, Collection, Environment, Response, …
│   │
│   └── utils/                   # pure helpers: var interpolation, curl, format
│
└── app.css                      # Tailwind entry (@import "tailwindcss")
```

### Feature-slice rules

- A slice owns its components + its local state + its public `index.ts`.
- **Slices never import each other's internals.** If two slices need the same
  thing, it moves down to `state/`, `components/ui/`, `types/`, or `utils/`.
- Import a slice only through its `index.ts` barrel.
- A `+page.svelte` should be ~20 lines: import a feature's entry component,
  render it. No business logic in routes.

---

## 4. State conventions (Svelte 5 runes)

- Reactive state lives in **`.svelte.ts`** files using `$state`/`$derived`.
  Export functions or a small object, not loose mutable bindings.
- **Feature-local** state → in the feature folder. **Cross-feature** state →
  `src/lib/state/`. Don't promote to global until a second feature needs it.
- State modules mutate **through `#lib/ipc`** for anything persistent. A store
  never calls `invoke` directly.
- This is a SPA (`ssr = false`): all state is client-side. Guard any
  `window`/`localStorage` access with `browser` from `$app/env` or run
  it in `onMount`.

Sketch:

```ts
// src/lib/state/workspace.svelte.ts
import { store } from "#lib/ipc";

export const workspace = $state({ active: null, collections: [] });

export async function loadWorkspace(id: string) {
  workspace.active = await store.getWorkspace(id);
  workspace.collections = await store.listCollections(id);
}
```

---

## 5. The IPC contract layer

This is the seam between the two halves of the app — treat it as a public API.

```ts
// src/lib/ipc/client.ts — the ONE place invoke() is imported
import { invoke } from "@tauri-apps/api/core";

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    throw normalizeError(e); // map serialized Rust error → typed AppError
  }
}
```

```ts
// src/lib/ipc/requests.ts
import { call } from "./client";
import type { HttpRequest, HttpResponse } from "#lib/types";

export const sendRequest = (req: HttpRequest) => call<HttpResponse>("send_request", { req });
```

Rules:

- Every command has **one** typed wrapper here. Components/state call the
  wrapper, never the raw string command name.
- Command argument and return types are imported from `#lib/types` — the same
  types the Rust structs serialize to. One shape, both sides.
- Long operations (a big request, a sync) stream progress via a `Channel`
  wrapper in `events.ts`, not by polling.

---

## 6. Backend structure (Rust, domain modules)

`main.rs` stays a thin passthrough (already is). `lib.rs` wires the builder and
registers commands. All real logic lives in focused modules.

```
src-tauri/src/
├── main.rs               # calls restio_lib::run() — do not grow this
├── lib.rs                # builder: .manage(state), generate_handler![…], plugins
│
├── commands/             # #[tauri::command] fns ONLY — thin adapters
│   ├── mod.rs
│   ├── requests.rs       # send_request, cancel_request
│   ├── store.rs          # collections/environments CRUD
│   └── sharing.rs        # publish/pull/import
│
├── http/                 # the HTTP engine (reqwest) — the heart of the app
│   ├── mod.rs
│   ├── executor.rs       # build + send, capture timing/size/redirects
│   └── auth.rs           # apply auth schemes to a request
│
├── store/                # local persistence (tauri-plugin-store or SQLite)
│   └── mod.rs
│
├── sync/                 # cross-user sharing transport (design TBD, §8)
│   └── mod.rs
│
├── models/               # serde structs shared over IPC (mirror #lib/types)
│   └── mod.rs
│
├── state.rs              # AppState behind Mutex<T>, held via .manage()
└── error.rs              # AppError enum, Serialize impl (crosses IPC)
```

### Backend rules

- **`commands/` are adapters, not logic.** A command deserializes args, calls a
  service in `http`/`store`/`sync`, maps the result. Keep them a few lines.
- Register **every** command in `generate_handler![…]` in `lib.rs`, or it fails
  silently at runtime.
- Commands return `Result<T, AppError>`; `AppError` implements `Serialize` so the
  frontend receives a structured error, not a panic.
- Async commands take **owned** args (`String`, not `&str`).
- Shared mutable state → `Mutex<AppState>` via `.manage()`, typed exactly.
- Adding a plugin = add its crate **and** its permission string in
  `src-tauri/capabilities/default.json` **and** init it in `lib.rs`. Miss any of
  the three and it silently no-ops.

---

## 7. Data flow (one request, end to end)

```
User edits request in request-editor slice
   └─ RequestEditor.svelte mutates request-editor.svelte.ts ($state)
        └─ on "Send": calls sendRequest(req) from #lib/ipc/requests
             └─ ipc/client.ts → invoke('send_request', { req })
                  └─ commands/requests.rs deserializes → http::executor::send()
                       └─ reqwest hits the network, captures status/headers/body/timing
                  ◄─ Result<HttpResponse, AppError> serialized back
        ◄─ response.svelte.ts stores it
   └─ response-viewer slice renders status, timing, headers, pretty body
   └─ history.svelte.ts appends the send (fire-and-forget persist via ipc/store)
```

Variable resolution (`{{base_url}}`) happens in `utils/` **before** the request
crosses IPC, using the active environment from `state/`.

---

## 8. Sharing boundary (keep it isolated)

Cross-user sharing is the product's reason to exist and its least-settled piece
(see CLAUDE.md §"The sharing feature"). Contain the churn:

- All sharing logic lives behind `src/lib/features/sharing/` (UI) +
  `src/lib/ipc/sharing.ts` (contract) + `src-tauri/src/sync/` (transport).
- The rest of the app depends only on the **contract** in `ipc/sharing.ts`, never
  on the transport. Swapping file-export for a cloud backend must touch only
  `sync/` and the ipc wrapper — nothing in `features/collections` or `state/`.
- **Never** put secrets or resolved environment values into anything shared.
  Share request _structure_ + variable _names_; each user supplies their own
  values. Enforce this at the `sync/` boundary.
- Portable format defaults to **Postman Collection v2.1-compatible** JSON so
  collections import/export interoperate.

---

## 9. Naming & style

| Thing              | Convention                            | Example                                  |
| ------------------ | ------------------------------------- | ---------------------------------------- |
| Svelte components  | PascalCase                            | `RequestEditor.svelte`                   |
| TS modules         | kebab-case                            | `request-editor.svelte.ts`, `client.ts`  |
| Runes state files  | `*.svelte.ts` suffix                  | `workspace.svelte.ts`                    |
| Feature folders    | kebab-case                            | `response-viewer/`                       |
| Rust modules/files | snake_case                            | `http/executor.rs`                       |
| Types/structs      | PascalCase both sides                 | `HttpRequest` / `struct HttpRequest`     |
| Command names      | snake_case string                     | `'send_request'`                         |
| Import alias       | `#lib` for everything under `src/lib` | `import { sendRequest } from '#lib/ipc'` |

- Icons are SVG from one set (never emoji). Colors are semantic Tailwind tokens,
  not raw hex in components. Dark mode is first-class (this is a dev tool).
- **Clickable = pointer cursor.** Tailwind v4's Preflight resets `<button>` to
  `cursor: default`, so clickable controls look inert. `src/routes/app.css` has a
  global base rule giving `button`/`[role="button"]`/`a[href]`/`label[for]`/
  `select` a pointer (and `disabled` → `not-allowed`) — **do not remove it, and
  don't add per-element `cursor-pointer` classes** (redundant). If you build a
  clickable element that is _not_ one of those tags (e.g. a clickable `<div>`),
  add `role="button"` + `tabindex="0"` + a keydown handler — that fixes the
  cursor _and_ accessibility. Prefer a real `<button>` whenever possible.
- Before designing any screen/component, consult the `ui-ux-pro-max` skill.

---

## 10. Definition of done for a change

- [ ] New native calls go through a typed wrapper in `src/lib/ipc/`; no `invoke`
      leaked into features/state/routes.
- [ ] New Rust command registered in `generate_handler![]` and returns
      `Result<T, AppError>`.
- [ ] Shared types added to **both** `#lib/types` and `models/` (same shape).
- [ ] No cross-slice internal imports; shared code pushed down a layer.
- [ ] `pnpm verify` passes (oxfmt check + oxlint + rustfmt check + svelte-check);
      run `pnpm lint:rust` too when Rust changed.
- [ ] Verified in `pnpm tauri dev` (IPC only exists inside the Tauri shell), not
      just a browser tab.
