---
title: Request Builder & Auth
description: Detailed guide to HTTP methods, request bodies, multipart file uploads, authentication schemes, and settings.
---

# Request Builder & Auth

The center panel of RestIO is the **Request Builder**. It provides controls for configuring every layer of an outbound HTTP packet before it is handed off to the native Rust engine.

```
+-----------------------------------------------------------------------+
|  [POST ▾]  {{base_url}}/api/v1/users/upload   [Send ▾]  [Save (⌘S)]   |
+-----------------------------------------------------------------------+
|  Preview: https://api.production.com/api/v1/users/upload              |
+-----------------------------------------------------------------------+
|  [Params]  [Headers (3)]  [Auth]  [Body ◉]  [Scripts]  [Settings]     |
|                                                                       |
|  Body Mode: ( ) None  ( ) JSON  ( ) Form  (•) Multipart  ( ) Binary  |
|                                                                       |
|  [x] name       | "Jane Doe"             | [text]                     |
|  [x] avatar     | /home/user/avatar.png  | [file 📁]                  |
+-----------------------------------------------------------------------+
```

---

## 1. Request Body Modes

RestIO supports five distinct payload formats:

| Mode                        | Use Case                                           | Content-Type Header                 |
| :-------------------------- | :------------------------------------------------- | :---------------------------------- |
| **None**                    | `GET`, `DELETE`, or `HEAD` requests without a body | None                                |
| **JSON**                    | Standard REST API JSON payloads                    | `application/json`                  |
| **Form (`form`)**           | URL-encoded web form submissions                   | `application/x-www-form-urlencoded` |
| **Multipart (`multipart`)** | Mixed text fields and binary file uploads          | `multipart/form-data`               |
| **Binary (`binary`)**       | Direct byte streaming from a local file            | Custom / detected from file         |
| **Text**                    | Raw plain text, XML, YAML, or GraphQL strings      | `text/plain`                        |

### Multipart File Uploads (`multipart/form-data`)

Uploading files in RestIO is native and secure:

1. Under the **Body** tab, select **Multipart**.
2. Click **+ Add Field**.
3. Choose the field type:
   - **Text**: Standard key-value string (e.g. `description = "Profile Picture"`).
   - **File**: Click the **Browse / File** icon to open the native OS file picker and select any local file (`.png`, `.pdf`, `.zip`, etc.).
4. The Rust backend reads the file directly from disk and streams it through `reqwest::multipart::Form`.

### Raw Binary Streaming (`binary`)

For endpoints that expect raw binary data directly in the request body (such as S3 object puts, image processing pipelines, or video uploads):

1. Select **Binary**.
2. Select your file path using the native file picker.
3. RestIO streams the raw bytes over the connection without loading the entire file into memory.

---

## 2. Authentication Schemes

RestIO provides 4 authentication modes in the **Auth** tab:

### 1. Inherit from Parent

- **Default for all requests and nested folders.**
- Automatically cascades credentials from the enclosing folder or collection.
- If the root collection specifies Bearer Auth, all child endpoints inherit that token automatically.

### 2. Bearer Token

- Transmits an authorization token via the `Authorization: Bearer <token>` header.
- Fully supports variable interpolation: `{{auth_token}}`.

### 3. Basic Auth

- Transmits Base64-encoded `username:password` credentials in the `Authorization: Basic ...` header.
- Supports variables for both fields: `{{admin_user}}` and `{{admin_pass}}`.

### 4. API Key

- Attaches a custom key-value credential.
- **Add To**:
  - **Header**: Transmits as a custom HTTP header (e.g. `X-API-Key: {{api_key}}`).
  - **Query**: Transmits as a URL query parameter (e.g. `?api_key={{api_key}}`).

---

## 3. Query Parameters & Custom Headers

- **Key-Value Editor**: Easily toggle rows on/off with checkboxes without deleting their values.
- **Bulk Variable Interpolation**: Use `{{variable}}` anywhere inside keys or values.
- **Auto Content-Type**: Setting a body mode automatically manages the appropriate `Content-Type` header while allowing manual overrides.
- **⚡ SSE Presets**: When testing streaming APIs or LLM completions, click the **⚡ Add SSE Preset** button above the headers table to instantly inject `Accept: text/event-stream` and `Cache-Control: no-cache`. Learn more in the [SSE & LLM Streaming Guide](/core/sse-and-llm-streaming).

---

## 4. Request Settings Tab

Fine-tune protocol-level parameters for individual requests:

| Setting                                        | Type      | Description                                                                                                                                                                             |
| :--------------------------------------------- | :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Automatic Cookie Jar & Session Persistence** | `Boolean` | When enabled (default), automatically attaches matching stored cookies to outbound requests and captures response `Set-Cookie` headers. Toggle off for pure stateless endpoint testing. |
| **Auto-Reconnect on Disconnect**               | `Boolean` | For WebSocket endpoints (`ws://`, `wss://`), automatically re-establishes connections on unexpected server drops. See [WebSocket Client Guide](/core/websocket-client).                 |
| **Dangerously Accept Invalid Certs**           | `Boolean` | When enabled, skips TLS certificate verification. Essential for developing against local microservices (`https://localhost:8443`) with self-signed SSL certificates.                    |
| **Custom Timeout (`timeoutMs`)**               | `Number`  | Overrides the default 30-second timeout. Set to `60000` (60s) for slow operations or `0` for indefinite waiting.                                                                        |
| **Mark as Deprecated**                         | `Boolean` | Adds an advisory strike-through badge to the endpoint in the sidebar to warn teammates not to build new features against it.                                                            |
