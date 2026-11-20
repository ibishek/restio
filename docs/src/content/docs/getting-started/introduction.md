---
title: Introduction
description: What is RestIO and why was it built?
---

# Introduction to RestIO

**RestIO** is a fast, shareable REST API client built as a cross-platform desktop application. It gives developers and teams the complete capability to compose, send, debug, and organize HTTP requests — while enabling seamless collaboration through **Git-backed collection sharing**.

```
+-------------------------------------------------------------+
|                     RestIO Workbench                        |
|                                                             |
|  [Sidebar]          [Request Editor]     [Response Panel]   |
|  * Collections      * Method & URL       * Status & Timing  |
|  * Nested Folders   * Query & Headers    * Headers & Body   |
|  * Environments     * Auth & Scripts     * Test Assertions  |
|  * History          * Code Generator     * Server Timings   |
+-------------------------------------------------------------+
                               |
                        Tauri v2 IPC (JSON)
                               |
+-------------------------------------------------------------+
|                      Rust Backend Core                      |
|                                                             |
|  * reqwest (HTTP/1.1, HTTP/2, Brotli, Gzip, Deflate, TLS)   |
|  * RequestRegistry (Native Abort Handles / Instant Cancel)  |
|  * SQLite Persistence & Atomic JSON Storage                 |
|  * Git Engine (Pull, Push, Branch Sync)                     |
+-------------------------------------------------------------+
```

---

## The Core Philosophy

Most API clients today fall into two traps:

1. **Cloud-locked and heavyweight**: They force team data into proprietary cloud silos, require user accounts, charge monthly seat fees, and suffer from sluggish web-view performance.
2. **Local-only silos**: Personal tools keep requests strictly on your machine, making it painful to keep team collections, environments, and documentation in sync as APIs evolve.

**RestIO bridges this gap:**

- **Native Rust Performance**: The core execution engine is compiled Rust using `reqwest`. It runs outside the browser sandbox, allowing full control over every HTTP header, cookie, and TLS setting with zero CORS limitations.
- **Git as the Single Source of Truth**: Collections can be stored directly within Git repositories. You can branch, review, merge, and version control API specifications using the same workflows you use for your code.
- **Zero Secret Leakage**: Environments and secrets stay strictly local in an encrypted SQLite database on your machine and are never accidentally committed to public or shared Git repositories.
- **Modern Desktop Shell**: Built with [Tauri v2](https://v2.tauri.app/) and [Svelte 5](https://svelte.dev/), RestIO consumes a fraction of the memory and CPU of traditional Electron clients while providing instantaneous startup and responsive dark-mode UI.

---

## Key Capabilities at a Glance

- ⚡ **Unrestricted HTTP Engine**: Set any forbidden headers (`Host`, `Origin`, `User-Agent`), connect to internal or local servers (`http://localhost:8080`), and inspect raw response bodies.
- 🛑 **Instant Request Cancellation**: Kill slow or hung requests immediately using native Rust abort handles.
- 🌲 **Hierarchical Inheritance**: Folders and collections support shared base URLs, headers, and authentication that child requests automatically inherit.
- 🌐 **Real-Time Resolved URL Bar**: Live preview of interpolated URLs showing the exact string that will be sent over the wire before hitting Send.
- 🧪 **JavaScript Scripting & Test Runtime**: Sandboxed pre-request logic and post-response assertion execution using the `rio.*` API (with full `pm.*` and `io.*` aliases).
- 🎲 **Mock Data Generation**: Integrated `@faker-js/faker` for dynamic, realistic request data generation right inside pre-request scripts.
- 🏃 **Automated Collection Runner**: Sequential test suite runner with variable chaining, iteration repeats, delay intervals, and exportable JSON run summaries.
- 🤝 **Open Standards Interoperability**: Import and export OpenAPI 3.0/3.1, Swagger 2.0 (YAML/JSON), and Postman v2.1 collections.
- 📜 **Multi-Target Code Generation**: 1-click export of any request to cURL, Python, JavaScript Fetch, Go, Rust, Ruby, PHP, and 10+ other languages.
- ⌨️ **Keyboard-First Workflow**: Spotlight-style Command Palette (`⌘K` / `Ctrl+K`), quick prefix filters, and accessible modal focus trapping.

---

## Next Steps

- Ready to install RestIO? Head to the [Installation Guide](/getting-started/installation/).
- Want to send your first request? Jump right into the [Quickstart Guide](/getting-started/quickstart/).
