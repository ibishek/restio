---
title: Rust HTTP Engine
description: Deep dive into RestIO's native Rust HTTP execution layer, zero CORS constraints, and instant cancellation.
---

# The Rust HTTP Engine

Unlike browser-based API clients, RestIO does not execute requests using the browser's `fetch()` or `XMLHttpRequest` API. All network traffic is handled by a compiled **Rust backend** using [`reqwest`](https://docs.rs/reqwest).

```
[ Frontend: SvelteKit UI ]
            |
            | Tauri IPC: invoke("send_request", { id, payload })
            v
[ Rust Backend: src-tauri/src/http/executor.rs ]
  ├── RequestRegistry: Stores Arc<AtomicBool> / AbortHandle
  ├── reqwest::ClientBuilder
  │     ├── rustls-tls (Modern TLS 1.2 / 1.3)
  │     ├── Brotli / Gzip / Deflate decompressors
  │     ├── HTTP/1.1 and HTTP/2 multiplexing
  │     └── Configurable Connect & Read Timeouts
  └── Network Socket Execution
```

---

## Why a Native Engine Matters

### 1. No CORS Limitations

In web-based or hybrid clients executing inside a browser WebView, the browser enforces the **Same-Origin Policy** and Cross-Origin Resource Sharing (CORS). Requests to third-party APIs often fail unless the destination server explicitly returns `Access-Control-Allow-Origin: *`.

Because RestIO executes requests in Rust:

- **Zero CORS errors**: Any public or private endpoint can be reached without proxy workarounds.
- **Localhost & Intranet**: Call internal ports (`http://localhost:3000`, `http://192.168.1.50`) freely without browser security blocks.

### 2. Forbidden Headers

Browser sandboxes prevent scripts from modifying certain "forbidden" headers (such as `Host`, `Origin`, `User-Agent`, `Referer`, `Cookie`, `Sec-*`).

RestIO allows you to override and inspect **every single byte and header on the wire**, which is crucial for testing API gateways, reverse proxies, and edge microservices.

### 3. Instant In-Flight Request Cancellation

Long-running requests, file uploads, or hung servers can be terminated on demand:

- When you click **Cancel** or press <kbd>Esc</kbd>, the frontend invokes the Tauri command `cancel_request(run_id)`.
- RestIO looks up the in-flight task in the Rust `RequestRegistry` and triggers its native `tokio::task::AbortHandle`.
- The underlying TCP socket is terminated immediately, freeing operating system file descriptors and client bandwidth.

---

## Engine Configuration Options

In each request's **Settings** tab, you can fine-tune the engine:

| Setting              | Default   | Description                                                                                                                                        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Request Timeout**  | `30000ms` | Maximum duration before the engine drops the connection with a `408 Request Timeout` error. Set to `0` for indefinite waits.                       |
| **Follow Redirects** | `true`    | Automatically follow HTTP `301`, `302`, `307`, and `308` redirects up to a maximum limit of 10 hops.                                               |
| **Verify SSL / TLS** | `true`    | Validates certificate authenticity. When testing local dev servers with self-signed certificates, toggle this off to bypass certificate rejection. |
| **HTTP Version**     | `Auto`    | Negotiate HTTP/2 via ALPN with automatic fallback to HTTP/1.1.                                                                                     |

---

## Inspection & Metrics

When a response returns, RestIO provides high-precision diagnostic metrics directly from Rust:

- **Timing Breakdown**: Total latency recorded using `std::time::Instant`.
- **Server Timings**: Parses standard `Server-Timing` headers into a visual waterfall graph showing backend database, cache, and compute durations.
- **Payload Size**: Exact uncompressed and wire transfer sizes.
