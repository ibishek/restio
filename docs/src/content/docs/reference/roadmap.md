---
title: Product Roadmap
description: Planned features, architectural priorities, and upcoming capabilities for RestIO.
---

# Product Roadmap

This document outlines the planned feature backlog, architectural considerations, and priority roadmap for **RestIO**.

---

## 🎯 Priority Matrix Overview

| Priority | Feature Area                                          | Primary Impact                      | Target Milestone |
| :------: | :---------------------------------------------------- | :---------------------------------- | :--------------: |
|  **P1**  | **Server-Sent Events (SSE) & LLM Stream Viewer**      | AI/LLM developer adoption           |   ✅ Completed   |
|  **P1**  | **Automatic Cookie Jar & Session Persistence**        | Frictionless auth workflows         |   ✅ Completed   |
|  **P2**  | **WebSocket Client (`ws://`, `wss://`)**              | Real-time & event-driven APIs       |   ✅ Completed   |
|  **P2**  | **GraphQL Explorer & Schema Introspection**           | Broadened protocol support          |     `v0.3.0`     |
|  **P3**  | **Built-in Local Rust Mock Server**                   | Offline & frontend-first dev        |     `v0.4.0`     |
|  **P3**  | **1-Click AI Test Assertion Generator**               | Speeding up QA script authoring     |     `v0.4.0`     |
|  **P3**  | **Data-Driven Testing (CSV / JSON Iteration Matrix)** | High-coverage parameterized testing |     `v0.4.0`     |
|  **P3**  | **Visual Response Diff Tool**                         | Regression & staging validation     |     `v0.4.0`     |
|  **P4**  | **Mutual TLS (mTLS) & Custom CA Certificates**        | Enterprise & microservice security  |     `v0.5.0`     |
|  **P4**  | **HTTP & SOCKS5 Proxy Support**                       | Corporate VPN & routing             |     `v0.5.0`     |
|  **P4**  | **1-Click Interactive Documentation Generator**       | Team handoff & living docs          |     `v0.5.0`     |
|  **P4**  | **Headless CLI Test Runner (`restio run`)**           | CI/CD automation & pipelines        |     Backlog      |

---

## Key Milestone Highlights

### Phase 1: High-Impact Core Differentiators (v0.2.0)

- **Server-Sent Events (SSE) & LLM Stream Viewer**: Essential for developers testing OpenAI, Anthropic, Gemini, or custom streaming endpoints (`text/event-stream`). Streams directly through Rust with live token counts and instant abort controls.
- **Automatic Cookie Jar**: Captures `Set-Cookie` headers into a managed per-domain SQLite cookie jar and transmits them on subsequent matching requests.

### Phase 2: Protocol Expansion & Core Developer Experience (v0.3.0)

- **WebSocket Client**: Interactive bidirectional client with binary/text frame composers, auto-reconnect, and ping/pong round-trip latency tracking.
- **GraphQL Explorer**: Schema introspection, Query/Mutation pane, and variable autocompletion.

### Phase 3 & 4: Polish, Enterprise Scale & Automation (v0.4.0+)

- **Embedded Local Mock Server**: Spawn an instant lightweight HTTP mock server directly from Rust matching saved collection routes.
- **1-Click Interactive Documentation Generator**: Generate a searchable, responsive static HTML page or Markdown file from any collection with endpoint descriptions and 16-language code snippets.
- **Headless CLI Test Runner (`restio run <collection>`)**: Run your RestIO test suites inside GitHub Actions or GitLab CI headlessly. Outputs JUnit XML and structured terminal logs with zero-exit codes on test success.
