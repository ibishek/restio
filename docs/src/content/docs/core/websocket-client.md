---
title: WebSocket Client (ws:// & wss://)
description: Real-time bidirectional WebSocket client with frame inspection, ping/pong latency tracking, and message composing in RestIO.
---

# WebSocket Client (`ws://`, `wss://`)

RestIO includes a built-in, first-class **WebSocket client** designed for testing real-time event feeds, financial market streams, chat backends, and subscription APIs.

Connections are managed directly by RestIO's native Rust core using **`tokio-tungstenite`** and pure-Rust TLS (`rustls`), ensuring low-overhead networking, zero thread blockage, and instant frame delivery.

---

## 1. Quick Start

### Creating a WebSocket Request

You can initiate a WebSocket connection in any of the following ways:

1. **Method Dropdown**: Open any request tab, click the HTTP method selector (e.g. `GET`), and select **`WS`** (`WebSocket`).
2. **URL Auto-Detection**: Type or paste a URL starting with `ws://` or `wss://` (e.g. `wss://echo.websocket.events`). RestIO automatically switches the tab into WebSocket mode.
3. **Command Palette**: Press <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>Cmd</kbd>+<kbd>K</kbd> on macOS) and run **`New WebSocket request`**.

![WebSocket Mode in Request Bar](file:///home/ambition/Projects/ag-api-man/docs/src/assets/logo.png)

### Handshake & Parameters

Just like standard HTTP requests, WebSockets in RestIO support:

- **Params**: Query parameters (e.g. `?token={{api_token}}&v=2`) automatically synchronize with the address bar and resolve environment variables.
- **Headers**: Custom handshake headers such as `Authorization: Bearer {{token}}`, `Sec-WebSocket-Protocol`, or custom cookies.
- **Settings**: Per-request toggles for TLS certificate validation and auto-reconnection.

Click **`Connect`** (or press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) to establish the connection.

---

## 2. Interactive Message Timeline

When a WebSocket request is active, the response pane transforms into a dedicated real-time **WebSocket Inspector**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ● Connected (01:24)  ·  ↓ 14 recv  ·  ↑ 6 sent  ·  3.4 KB  ·  RTT: 22ms │ [Ping] [Disconnect] [Clear]
├────────────────────────────────────────────────────────────────────────┤
│ [All (20)]  [Incoming (14)]  [Outgoing (6)]  [Ping/Pong]  [Filter: ...]   ☑ Auto-scroll
├────────────────────────────────────────────────────────────────────────┤
│ ↓ IN   TEXT   22 B   15:30:12.104                               [Copy] [▼]
│ {"event":"subscribed","channel":"ticker/BTC-USD"}
├────────────────────────────────────────────────────────────────────────┤
│ ↑ OUT  TEXT   45 B   15:30:15.820                               [Copy] [▼]
│ {"action":"subscribe","channel":"ticker/ETH-USD"}
├────────────────────────────────────────────────────────────────────────┤
│ ⚡ PONG  22ms RTT   15:30:20.012
└────────────────────────────────────────────────────────────────────────┘
```

### Filtering & Search

- **Filter Tabs**: Quickly isolate **`Incoming (↓)`**, **`Outgoing (↑)`**, or **`Ping/Pong (⚡)`** frames.
- **Search Query**: Filter payload text in real-time across incoming and outgoing streams.
- **Auto-Scroll**: Automatically pins the view to the latest incoming frames as they stream in.

### Frame Details & Formatting

- **JSON Pretty-Printing**: Valid JSON payloads can be expanded with one click to view syntax-formatted, readable structures.
- **Timestamp & Size**: Every message records precise millisecond timestamps (`HH:MM:SS.mmm`) and byte payload sizes.
- **1-Click Copy**: Copy message payloads straight to your system clipboard.

---

## 3. Latency Tracking & Heartbeats (Ping / Pong)

RestIO provides native diagnostics to measure round-trip network performance:

1. Click the **`Ping`** button in the connection toolbar.
2. The Rust engine emits a native WebSocket `Ping` control frame to the remote server.
3. Upon receiving the server's `Pong` reply, RestIO calculates the exact round-trip time (RTT in milliseconds) and logs it in the message timeline with an `RTT: <ms>` badge.

---

## 4. Message Composer

The bottom pane features a flexible message composer with 3 payload modes:

| Mode                | Use Case                                             | Features                                                                                                        |
| :------------------ | :--------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| **JSON**            | Structured API commands and RPCs                     | Includes a **Format JSON** shortcut to validate and beautify payloads before dispatching.                       |
| **Plain Text**      | Simple strings, custom delimiters, or text protocols | Raw text frame delivery.                                                                                        |
| **Binary (Base64)** | Protobuf, MessagePack, or custom binary feeds        | Enter Base64-encoded strings; RestIO decodes bytes natively in Rust and transmits raw `Message::Binary` frames. |

> **Pro-Tip**: Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (or <kbd>Cmd</kbd>+<kbd>Enter</kbd> on macOS) to dispatch your composed message without taking your hands off the keyboard.

---

## 5. Configuration & Resilience

In the **Settings** tab of the request builder, you can configure:

- **Auto-reconnect on connection drop**: Automatically retries establishing the connection if the server closes unexpectedly or during network blips.
- **Allow self-signed or invalid SSL/TLS certificates**: Bypasses certificate verification for local development servers (`wss://localhost:*`).
- **Connection Timeout**: Custom timeout threshold before aborting stalled connection handshakes.

---

## 6. Collections & Git Sync

WebSocket requests are first-class citizens in RestIO:

- Save WebSocket endpoints directly inside collection folders alongside HTTP endpoints.
- WebSocket requests display a distinct **`WS`** purple pill badge in the collection tree and tab strip.
- Collection parameters and handshake headers are stored in Git-tracked `collections.json`, allowing your entire team to share real-time API configurations.
