---
title: SSE & LLM Stream Viewer
description: Inspecting Server-Sent Events (SSE) and real-time streaming LLM completions from OpenAI, Anthropic, Gemini, Ollama, and custom endpoints.
---

# Server-Sent Events (SSE) & LLM Stream Viewer

RestIO provides first-class support for **Server-Sent Events (`text/event-stream`)** and streaming LLM completions. Whether you are debugging microservice event feeds or building generative AI workflows with OpenAI, Anthropic Claude, Google Gemini, Ollama, or DeepSeek, RestIO streams response chunks into the desktop UI in real time.

```
+----------------------------------------------------------------------------------+
|  Status: 200 OK      Time: 1.4s      Size: 4.2 KB                [Save Example]  |
+----------------------------------------------------------------------------------+
|  [Body]  [⚡ Stream (42)]  [Headers (8)]  [Timing]  [Test Results]                |
|                                                                                  |
|  ● Streaming   42 events · TTFT: 124ms · ~318 tok · 28.4 tok/s · 1.4s · 4.2 KB  |
|  [ ✦ LLM View  |  ≡ Events (42) ]            [☑ Auto-scroll]  [📋 Copy] [⏹ Abort] |
|                                                                                  |
|  (✦ LLM View)                                                                    |
|  Here is the response streaming in real time as tokens arrive...                 |
|  Code blocks and text stream smoothly with zero webview lag. █                   |
+----------------------------------------------------------------------------------+
```

---

## 1. 1-Click SSE Creation & Header Presets

You do not need to manually type headers or remember exact MIME types to stream:

- **Command Palette (`⌘K` / `Ctrl+K`)**:
  - Type `sse` and choose **New SSE / stream request** to create a tab pre-configured with `Accept: text/event-stream` and `Cache-Control: no-cache`.
  - Choose **Add SSE streaming headers** to inject streaming headers into your active request instantly.
- **Headers Tab Preset**: In the request editor under the **Headers** tab, click **⚡ Add SSE Preset** to insert `Accept: text/event-stream` and `Cache-Control: no-cache` with a single click.

---

## 2. Automatic Stream Detection & Activation

Whenever an endpoint responds with:

- `Content-Type: text/event-stream`
- Chunked transfer streaming payloads
- Standard SSE headers or event data

RestIO automatically activates and highlights the **Stream** tab in the response panel. Incoming chunks are delivered continuously from the native Rust engine to the SvelteKit frontend without waiting for the full HTTP connection to terminate.

---

## 2. Dual-View Modes

### Mode A: ✦ LLM View (Token Accumulator & Assistant Mode)

Designed specifically for AI/LLM developers working with streaming chat completions:

- **Automatic Delta Extraction**: Unpacks streaming tokens and deltas from:
  - **OpenAI / Groq / vLLM / DeepSeek**: `choices[0].delta.content` and `reasoning_content`
  - **Anthropic Claude**: `content_block_delta` (`text_delta` and `thinking`)
  - **Google Gemini**: `candidates[0].content.parts[0].text`
  - **Ollama**: `message.content` or `response`
- **Real-time Streaming Cursor**: Visual pulsing cursor (`█`) indicating active token generation.
- **Text Statistics**: Live counters for word count, character count, and estimated tokens.
- **Smart Auto-Scroll**: Viewport stays pinned to the newest tokens as they arrive. If you scroll up to inspect previous output, auto-scroll detaches automatically and displays a floating **↓ Latest tokens** jump button.

### Mode B: ≡ Events View (Raw SSE Protocol Inspector)

Designed for event-driven systems, live financial tickers, webhooks, and telemetry feeds:

- **Chronological Timeline**: Every SSE event is displayed in sequence with:
  - Event index (`#1`, `#2`, …)
  - Delta arrival latency (`+0ms`, `+42ms`, `+115ms`)
  - Event type badge (`message`, `content_block_delta`, custom events)
  - Event ID badge (`id: 12345`)
- **Collapsible & Highlighted Payloads**: Click any event row to expand formatted JSON with syntax highlighting or inspect raw text.
- **Real-Time Filter**: Search across event payloads, event types, or event IDs instantly with the built-in search bar.

---

## 3. Real-Time Performance Metrics

During and after streaming, the top metrics bar displays:

| Metric                         | Description                                                                                                |
| :----------------------------- | :--------------------------------------------------------------------------------------------------------- |
| **Status Badge**               | `● Streaming` (emerald pulse), `● Completed` (slate/green), or `■ Aborted` (rose).                         |
| **Events Counter**             | Total number of individual SSE events received.                                                            |
| **TTFT (Time to First Token)** | Milliseconds from request dispatch to arrival of the first token/event. Crucial benchmark for LLM latency. |
| **Token Estimation**           | Running token count based on LLM heuristic (~4 chars/token).                                               |
| **Throughput (tok/s)**         | Real-time generation speed in tokens per second.                                                           |
| **Elapsed Duration**           | Cumulative duration of the active stream.                                                                  |
| **Payload Size**               | Total bandwidth transferred.                                                                               |

---

## 4. Controls & Exporting

- **1-Click Copy**: Copy either the assembled LLM text or the entire formatted SSE stream (`event: ...\ndata: ...`) to your clipboard.
- **Export Stream**: Export live streams to disk as:
  - `.txt` for assembled markdown / LLM text
  - `.jsonl` (NDJSON) for structured event analysis
- **Instant Abort**: Click **Abort** or press <kbd>Escape</kbd> to immediately terminate the HTTP connection and drop the socket handle in Rust via `cancelRequest(runId)`.

---

## 5. Architecture: How It Works Under the Hood

```
┌─────────────────────┐   IPC Channel<StreamChunk>   ┌───────────────────────────────┐
│     Rust Engine     │ ───────────────────────────> │     SvelteKit Frontend        │
│  (reqwest::chunk)   │                              │ (StreamParser & StreamViewer) │
└─────────────────────┘                              └───────────────────────────────┘
          │                                                          │
          ▼                                                          ▼
Non-blocking async read                               Reactive Svelte 5 Runes state:
- index, elapsed_ms, bytes                            - SseEvent[] buffer
- zero memory leaks                                   - Smooth LLM accumulator
- instant AbortHandle cancel                          - Filterable timeline
```

1. **Rust Executor (`http::executor`)**: Reads asynchronous chunks via `resp.chunk().await`.
2. **Tauri v2 Channel**: Chunks are forwarded across the native IPC bridge using `tauri::ipc::Channel<StreamChunk>`.
3. **StreamParser (`StreamViewer/streamParser.ts`)**: Handles cross-chunk SSE line buffering, parses `data:`, `event:`, and `id:`, extracts LLM deltas, and updates live metrics without main-thread blocking.
