---
title: Cookie Jar & Session Persistence
description: Automatic capturing, domain matching, and SQLite persistence of session cookies and Set-Cookie response headers.
---

# Cookie Jar & Session Persistence

RestIO includes a built-in, native **Automatic Cookie Jar & Session Manager**. It automatically captures `Set-Cookie` response headers, stores them securely in local SQLite, and matches and injects valid cookies on subsequent requests according to **RFC 6265**.

```
+----------------------------------------------------------------------------------+
|  Status: 200 OK      Time: 84ms      Size: 1.2 KB                 [Save Example] |
+----------------------------------------------------------------------------------+
|  [Body]  [Cookies (2)]  [Headers (6)]  [Timing]  [Test Results]                  |
|                                                                                  |
|  [Search cookies...]                [📋 Copy as Cookie Header] [Manage Jar ↗]    |
|                                                                                  |
|  Name           Value       Domain       Path   Expires   Attributes             |
|  session_id     tok_987x…   api.com      /      Session   [HttpOnly] [Secure]    |
|  csrf_token     a1b2c3d…    api.com      /      24h       [Secure] [SameSite=Lax]|
+----------------------------------------------------------------------------------+
```

---

## 1. How It Works

1. **Zero-Configuration Capture**:
   - Whenever an endpoint responds with one or more `Set-Cookie` headers, RestIO parses each cookie's attributes (`Domain`, `Path`, `Expires`, `Max-Age`, `HttpOnly`, `Secure`, `SameSite`).
   - The cookie is immediately persisted to the active workspace's local SQLite database (`restio.db`).
   - If a cookie specifies `Max-Age=0` or an expiration date in the past, RestIO automatically deletes it from the store.

2. **RFC 6265 Automatic Matching**:
   - When sending a request, the native Rust HTTP engine queries the SQLite store for unexpired cookies that match the destination URL:
     - **Domain Matching**: Matches exact host (`api.example.com`) or parent domain (`.example.com`).
     - **Path Matching**: Matches exact path or prefix paths (`/` matches `/v1/users`).
     - **Secure Flag**: Transmitted only over HTTPS connections (or `localhost`).
     - **Expiration**: Filtered so expired tokens are automatically discarded.
   - Matching cookies are assembled and dispatched via standard `Cookie: name=val; name2=val2` headers.

3. **Per-Workspace Isolation**:
   - Cookies are strictly scoped to the active workspace. Switching workspaces provides an isolated session environment, preventing cookie leaks between personal, staging, or production testing.

---

## 2. Response Inspector "Cookies" Tab

Whenever a response sets or updates cookies:

- The **Cookies** tab highlights in the response panel with a badge indicating the number of cookies (`Cookies (2)`).
- Developers can:
  - Inspect cookie names, values, domain, path, and human-readable expiry.
  - Review security attributes: `HttpOnly`, `Secure`, and `SameSite` (`Strict`, `Lax`, `None`).
  - **1-Click Copy Value**: Copy any individual token or secret.
  - **Copy as Cookie Header**: Copy the formatted `Cookie: ...` string ready for scripts or cURL commands.
  - **Manage Workspace Cookies ↗**: Jump directly into the workspace Cookie Manager.

---

## 3. Dedicated Workspace Cookie Manager

Open the Cookie Manager anytime from:

- Response Panel → **Manage Workspace Cookies ↗**
- Command Palette (<kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd>) → `Manage cookies`

Inside the Cookie Manager:

- **Domain Sidebar**: Browse all saved cookies organized by domain (`example.com`, `localhost`, `github.com`).
- **Search & Filter**: Search cookies across names, values, or domains in real time.
- **Manual Cookie Authoring**: Click **+ Add Cookie** to manually inject cookies (e.g. testing authenticated flows with existing web session tokens).
- **Domain Purge**: Click **Clear Domain** to remove all cookies for a specific host.
- **Purge All**: Click **Purge All Cookies** to reset the entire workspace cookie jar.

---

## 4. Disabling Cookies for Stateless Testing

For stateless API testing (such as microservices or OAuth bearer workflows where session cookies should not be sent):

1. Open your request in the workbench.
2. Select the **Settings** tab.
3. Toggle off **Automatic Cookie Jar & Session Persistence**.
4. Outbound calls will omit stored cookies and ignore incoming `Set-Cookie` directives.

---

## 5. Command Palette Shortcuts

| Command                         | Action                                                          |
| :------------------------------ | :-------------------------------------------------------------- |
| `> Manage cookies`              | Opens the Cookie Manager modal                                  |
| `> Clear all workspace cookies` | Clears all cookies across all domains for the current workspace |
