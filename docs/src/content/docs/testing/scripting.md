---
title: Scripting Runtime
description: Understand the sandboxed JavaScript execution lifecycle before and after HTTP requests.
---

# Scripting Runtime

RestIO provides a sandboxed JavaScript runtime that executes scripts before an outbound request is sent (**Pre-request**) and immediately after the response arrives (**Post-response / Tests**).

```
   [ 1. Pre-request Script ]
               │
               ▼
   [ 2. Variable Interpolation ({{var}}) ]
               │
               ▼
   [ 3. Outbound Rust HTTP Execution ]
               │
               ▼
   [ 4. Response Received ]
               │
               ▼
   [ 5. Post-response / Tests Script ]
               │
               ▼
   [ 6. Assertions & Console Display ]
```

---

## Script Execution Lifecycle

### 1. Pre-request Scripts

Pre-request scripts run before RestIO builds the outgoing HTTP packet. Use pre-request scripts to:

- Compute dynamic hashes, HMAC signatures, or timestamps.
- Generate mock data payloads using the built-in [Faker library](/restio/testing/mock-data/).
- Set or modify variables via `rio.setEnv()`.
- Mutate the outgoing request body dynamically via `rio.request.body = ...`.

### 2. Post-response / Tests Scripts

Post-response scripts run as soon as HTTP status codes, headers, and payload bytes are received by the Rust engine. Use post-response scripts to:

- Validate HTTP status codes (`rio.response.to.have.status(200)`).
- Verify payload schemas, properties, and values (`rio.expect(data.id).to.be.a("number")`).
- Extract tokens or session IDs to feed subsequent chained requests (`rio.setEnv("token", data.token)`).
- Benchmark response time and performance thresholds.

---

## Global Namespaces & Compatibility

RestIO exposes the **`rio`** object as the primary scripting interface.

To ensure frictionless migration from other tools, RestIO automatically registers three aliases in every script execution context:

| Alias | Description                                                                                                                                     |
| :---- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `rio` | **Primary native namespace** for RestIO.                                                                                                        |
| `io`  | Short shorthand for `rio`.                                                                                                                      |
| `pm`  | **Postman compatibility alias**. Existing Postman scripts using `pm.test`, `pm.expect`, `pm.response`, `pm.environment.set` run out of the box! |
| `am`  | Internal workbench compatibility alias.                                                                                                         |

---

## Safety & Sandboxing

The scripting engine runs in an isolated context where dangerous browser globals (`window`, `document`, `fetch`, `localStorage`, `indexedDB`, `eval`) are shadowed and neutralized. Scripts cannot access local storage tokens or interfere with the host application runtime.

---

## Logging & Debugging

Use standard `console.log()`, `console.warn()`, and `console.error()` inside your scripts:

```javascript
const user = rio.response.json();
console.log("Logged in user ID:", user.id);
console.warn("Token expires in less than 5 minutes");
```

All log messages appear in the **Console** tab of the **Response Panel** alongside execution timestamps.
