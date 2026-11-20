---
title: Architecture & Engine
description: Internal architectural layer model, IPC contract, and design principles of RestIO.
---

# Architecture & Engine

RestIO follows a clean, decoupled layer architecture separating the native **Rust Backend** from the modern **SvelteKit Desktop Frontend**.

```
+----------------------------------------------------------------+
|                       RestIO Architecture                      |
+----------------------------------------------------------------+
|  FRONTEND LAYER (SvelteKit + Svelte 5 runes + Tailwind CSS v4) |
|  - routes/+page.svelte (Single-Page App, client-side only)     |
|  - features/workbench (Sidebar, Request, Response, Runner)     |
|  - ipc/ (Typed wrappers around Tauri invoke() calls)          |
|  - types/ (Domain models & single source of truth)             |
+----------------------------------------------------------------+
                               |
                       Tauri v2 IPC (JSON)
                               |
+----------------------------------------------------------------+
|  BACKEND LAYER (src-tauri - Rust edition 2021)                 |
|  - commands/ (Tauri command handlers: requests, store, git)    |
|  - http/executor.rs (reqwest HTTP execution engine)           |
|  - store/ (Atomic JSON collection store + SQLite database)     |
|  - state.rs (RequestRegistry with native AbortHandles)         |
|  - models/ (Serde serialization mirroring frontend types)      |
+----------------------------------------------------------------+
```

---

## Design Principles

### 1. Zero Direct Web Fetch

The browser frontend never issues direct network requests to external servers. All requests are routed through Tauri's IPC bridge to `src-tauri/src/http/executor.rs`. This guarantees complete immunity from CORS limitations and provides access to raw sockets.

### 2. Svelte 5 Runes for Reactivity

The user interface uses Svelte 5 runes (`$state`, `$derived`, `$effect`, and `.svelte.ts` store classes). State updates are reactive without the memory overhead of virtual DOM diffing.

### 3. Isolation of Secrets

Collections and requests are persisted as atomic, formatted JSON files suitable for Git version control. Environment variable values (specifically marked secrets) are saved exclusively in a local SQLite database (`rusqlite`) in the operating system's `app_data_dir`.

### 4. IPC Serialization & Cancellation

- Every request execution receives a unique `run_id` (UUID).
- In-flight requests can be cancelled asynchronously: `cancel_request(run_id)` retrieves the corresponding `tokio::task::AbortHandle` and aborts the execution task in Rust.
