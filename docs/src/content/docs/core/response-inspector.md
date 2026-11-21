---
title: Response Inspector & Diagnostics
description: Inspecting HTTP status codes, headers, HTML previews, large payload downloads, and the Server-Timing visualizer.
---

# Response Inspector & Diagnostics

The right panel of RestIO provides diagnostic tools for analyzing server responses, verifying headers, measuring network latency, and visualizing server-side performance.

```
+-----------------------------------------------------------------------+
|  Status: 200 OK      Time: 142 ms      Size: 4.8 KB     [Save Example] |
+-----------------------------------------------------------------------+
|  [Body]  [⚡ Stream (42)]  [Headers (12)]  [Timing ◉]  [Test Results]   |
|                                                                       |
|  Server Timing Waterfall:                                             |
|  Total Server Duration: 82 ms                                         |
|  [=== db (42ms) ===][== cache (18ms) ==][= auth (22ms) =]            |
|                                                                       |
|  * db: Database Query (Postgres)  ─── 42.0 ms (51.2%)                 |
|  * cache: Redis Session Lookup    ─── 18.0 ms (22.0%)                 |
|  * auth: JWT Verification         ─── 22.0 ms (26.8%)                 |
+-----------------------------------------------------------------------+
```

---

## 1. Response Body Views

Under the **Body** tab, you can inspect payloads across multiple modes:

- **Pretty**: Formatted JSON, XML, or HTML with syntax highlighting, line numbers, and collapsible nodes.
- **Raw**: The exact byte string received over the socket without reformatting.
- **Preview (HTML)**: Renders HTML responses inside an isolated, sandboxed `<iframe>` with JavaScript execution disabled for security.
- **Search in Body**: Press <kbd>⌘F</kbd> / <kbd>Ctrl+F</kbd> inside the response viewer to quickly find keys or values in large payloads.

---

## 2. Server-Sent Events (SSE) & LLM Streaming

When calling streaming endpoints (`Content-Type: text/event-stream` or chunked transfer streaming), RestIO automatically activates the **Stream** tab:

- **✦ LLM View**: Automatically extracts deltas from OpenAI, Anthropic Claude, Google Gemini, Ollama, and DeepSeek, rendering live markdown/text with a blinking streaming cursor (`█`), token counters, and smart auto-scroll.
- **≡ Events View**: Filterable chronological timeline with per-event latency badges (`+XXms`), event type and ID badges, collapsible payloads, and JSON formatting.
- **Real-Time Performance Strip**: Live tracking of TTFT (Time to First Token), tokens/sec throughput, duration, and transferred bytes.
- **Controls**: 1-click text copy, export to `.txt` or `.jsonl`, and non-blocking abort.

> For an in-depth walkthrough, see [SSE & LLM Stream Viewer](./sse-and-llm-streaming).

---

## 3. Server-Timing Waterfall Visualizer

RestIO features native visual parsing of the standard [`Server-Timing`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing) HTTP response header.

If your backend emits headers like:

```http
Server-Timing: db;dur=42;desc="Database Query", cache;dur=18;desc="Redis Cache", auth;dur=22
```

RestIO automatically creates:

1. **Stacked Proportional Waterfall Bar**: A color-coded bar visualizing which backend subsystem consumed the most compute time.
2. **Breakdown List**: Exact millisecond durations and percentages of server execution time.
3. **Network vs. Server Delta**: Compares total client-recorded round-trip time (`clientRoundTripMs`) against backend processing time to highlight network/proxy latency overhead.

---

## 4. Large Payload Protection & Native Downloads

Rendering massive JSON or text files (e.g. 10MB+) inside a webview DOM causes high memory consumption and browser freezes.

RestIO includes automatic safety mechanisms:

- **Automatic Capping**: Payloads up to **512 KB** are highlighted with syntax tokens.
- **Safe Rendering**: Payloads up to **3 MB** are rendered in raw format.
- **1-Click Native Disk Download**: Payloads exceeding **3 MB** display a safe warning banner with a **Download File** button that saves the complete response directly to your hard drive using native Rust file streaming.

---

## 5. Header Search & 1-Click Copy

The **Headers** tab provides:

- **Filter Search Bar**: Quickly filter through dozens of response headers by name or value.
- **Individual Header Copy**: Hover over any row and click the copy icon to grab that specific value.
- **Copy All Headers**: 1-click clipboard export of all headers as formatted HTTP text.
