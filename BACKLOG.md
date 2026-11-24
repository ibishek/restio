# RestIO Product Backlog & Roadmap

This document outlines the planned feature backlog, architectural considerations, and priority roadmap for **RestIO**.

---

## 🎯 Priority Matrix Overview

| Priority | Feature Area                                     | Primary Impact                      | Target Milestone |
| :------: | :----------------------------------------------- | :---------------------------------- | :--------------: |
|  **P1**  | **Server-Sent Events (SSE) & LLM Stream Viewer** | AI/LLM developer adoption           |   ✅ Completed   |
|  **P1**  | **Automatic Cookie Jar & Session Persistence**   | Frictionless auth workflows         |   ✅ Completed   |
|  **P2**  | **WebSocket Client (`ws://`, `wss://`)**         | Real-time & event-driven APIs       |   ✅ Completed   |
|  **P2**  | **GraphQL Explorer & Schema Introspection**      | Broadened protocol support          |      v0.3.0      |
|  **P3**  | **Built-in Local Rust Mock Server**              | Offline & frontend-first dev        |      v0.4.0      |
|  **P3**  | **1-Click AI Test Assertion Generator**          | Speeding up QA script authoring     |      v0.4.0      |
|  **P3**  | **Data-Driven Testing (CSV / JSON Iteration)**   | Enterprise multi-case testing       |      v0.4.0      |
|  **P3**  | **Visual Response Diff Tool**                    | Regression & staging validation     |      v0.4.0      |
|  **P4**  | **Mutual TLS (mTLS) & Custom CA Certificates**   | Enterprise & microservice security  |      v0.5.0      |
|  **P4**  | **HTTP & SOCKS5 Proxy Support**                  | VPN & debugging proxy routing       |      v0.5.0      |
|  **P4**  | **Rich Response Media Visualizers**              | HTML sandbox, SVG/Image, Audio, PDF |      v0.5.0      |
|  **P4**  | **1-Click Static API Documentation Generator**   | Team handoff & living docs          |      v0.5.0      |
|  **P4**  | **Headless CLI Test Runner (`restio run`)**      | CI/CD integration & automation      |     Backlog      |

---

## 📌 Phase 1: High-Impact Core Differentiators (v0.2.0)

### 1. Server-Sent Events (SSE) & LLM Stream Viewer

- [x] **Status:** Completed
- **Motivation:** Essential for modern developers building or testing OpenAI, Anthropic, Gemini, or custom streaming endpoints (`text/event-stream`).
- **Architecture:**
  - **Rust Backend:** Use `reqwest` streaming response body; emit chunks over Tauri `Channel` or event stream to avoid blocking the main thread.
  - **Frontend:** Stream inspector in `ResponsePanel.svelte` with token generation counter, chunk arrival timeline, auto-scroll toggle, and copy-accumulated-text.
- **Acceptance Criteria:**
  - Handles indefinite or chunked streaming without memory leaks.
  - Native abort button immediately cuts the connection and drops socket handles in Rust.

### 2. Automatic Cookie Jar & Session Manager

- [x] **Status:** Completed
- **Motivation:** APIs that rely on `Set-Cookie` session tokens require tedious manual header extraction.
- **Architecture:**
  - **Rust Backend:** Wire `reqwest::cookie::Jar` into the client builder; persist cookies per-workspace in SQLite (`store/db.rs`).
  - **Frontend:** A dedicated "Cookies" inspector tab allowing developers to view, edit, or purge cookies for specific domains.
- **Acceptance Criteria:**
  - Automatically captures `Set-Cookie` headers and includes matching cookies on subsequent domain calls.
  - Safe toggle per request to disable automatic cookie sending when testing stateless endpoints.

---

## 📌 Phase 2: Protocol Expansion & Core Developer Experience (v0.3.0)

### 3. WebSocket Client (`ws://`, `wss://`)

- [x] **Status:** Completed
- **Motivation:** Real-time event streams, subscriptions, and bi-directional communications.
- **Architecture:**
  - **Rust Backend:** Managed WebSocket connections via `tokio-tungstenite`.
  - **Frontend:** Interactive message history pane with filterable message types (inbound/outbound), payload composer (JSON/text/binary), and ping/pong round-trip latency graph.
- **Acceptance Criteria:**
  - Supports custom connection headers, query parameters, and auto-reconnect configurations.

### 4. GraphQL Explorer & Schema Introspection

- [ ] **Status:** Backlog
- **Motivation:** First-class GraphQL authoring without needing third-party extensions.
- **Architecture:**
  - Dedicated request mode providing Query / Mutation / Subscription panes, a Variables JSON editor, and a 1-click "Fetch Schema" introspection button with schema-based autocompletion.

---

## 📌 Phase 3: Testing & Productivity Multipliers (v0.4.0)

### 5. Built-in Local Rust Mock Server

- [ ] **Status:** Backlog
- **Motivation:** Allows frontend developers to build against APIs before the backend exists or during offline development.
- **Architecture:**
  - Lightweight embedded HTTP server (`axum` or `tiny_http`) spawned directly from the Rust backend on a chosen port (`localhost:PORT`).
  - Routes match saved request URLs and return saved example response bodies and status codes.
- **Acceptance Criteria:**
  - Configurable route matching (exact, path parameter, or wildcard).
  - Configurable response delay simulation (e.g. simulate 200ms latency or 500 error rates).

### 6. 1-Click AI Test Assertion Generator

- [ ] **Status:** Backlog
- **Motivation:** Eliminate boilerplate writing of `am.test()` assertions.
- **Architecture:**
  - Inspects the active response payload and schema to auto-populate the post-response test editor with assertions: status code, latency threshold, header presence, and JSON schema structural validation.

### 7. Data-Driven Testing (CSV / JSON Iteration Matrix)

- [ ] **Status:** Backlog
- **Motivation:** High-coverage integration testing across large parameter sets.
- **Architecture:**
  - Extend `CollectionRunnerDialog.svelte` to allow attaching a `.csv` or `.json` dataset.
  - Iterates requests per row, injecting row fields into `{{column_name}}` placeholders.

### 8. Visual Response Diff Tool

- [ ] **Status:** Backlog
- **Motivation:** Instant verification of breaking changes between environments or software releases.
- **Architecture:**
  - Side-by-side or inline syntax diffing of response status, headers, and body between two recorded history snapshots or environments (e.g. Staging vs. Prod).

---

## 📌 Phase 4: Security, Network, Polish & Future Capabilities (v0.5.0+)

### 9. Mutual TLS (mTLS) & Custom CA Certificates

- [ ] **Status:** Backlog
- **Motivation:** Secure enterprise microservices, internal staging environments, and zero-trust gateways.
- **Architecture:**
  - Per-workspace or per-environment client certificate configuration (`.pem`, `.p12`, `.crt`) and custom Root CA bundle injection into `reqwest::ClientBuilder`.

### 10. Custom HTTP & SOCKS5 Proxy Routing

- [ ] **Status:** Backlog
- **Motivation:** Routing requests through corporate forward proxies, bastion hosts, or local traffic interceptors (Charles / Burp / Proxyman).

### 11. Rich Media Response Visualizers

- [ ] **Status:** Backlog
- **Motivation:** Better inspection of non-JSON endpoints.
- **Features:**
  - **HTML:** Isolated, sandboxed preview iframe with script execution disabled.
  - **Images & SVGs:** Native previewer with zoom/pan and dimensions display.
  - **PDF & Audio:** Embedded viewer for generated documents and synthesized voice endpoints.

### 12. 1-Click Interactive Documentation Generator

- [ ] **Status:** Backlog
- **Motivation:** Eliminate the need for separate documentation portals.
- **Features:**
  - Generates a searchable, responsive static HTML page or Markdown file from any collection with endpoint descriptions, schema tables, and code snippets in 16 languages.

### 13. Headless CLI Test Runner (`restio run <collection>`)

- [ ] **Status:** Backlog (Low Priority)
- **Motivation:** Allows teams to run their RestIO test collections in GitHub Actions, GitLab CI, or local terminal pipelines (like Postman's `newman` or Bruno's `bru-cli`).
- **Architecture:**
  - A standalone CLI binary (`restio-cli`) or Tauri sub-command that executes the same Rust collection runner engine headlessly.
  - Outputs structured test logs: CLI terminal table, JUnit XML (for CI test reporting), and JSON summaries.
- **Acceptance Criteria:**
  - Exits with status `0` on test success and non-zero on assertion failures.
  - Accepts environment files (`--env production.json`) and variable overrides (`--var token=xyz`).
