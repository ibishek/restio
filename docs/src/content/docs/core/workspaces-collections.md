---
title: Workspaces & Collections
description: How RestIO organizes APIs hierarchically with base URL and auth inheritance.
---

# Workspaces & Collections

RestIO uses a two-tier organization model: **Workspaces** provide broad project isolation, while **Collections** and **Folders** provide hierarchical inheritance for endpoints.

---

## Workspaces

A **Workspace** is an isolated scope containing its own set of:

- Collections and saved requests
- Environments and secret variables
- Send history logs
- Active tabs and layout state

### Use Cases for Workspaces

- **Multi-Project Separation**: Keep `E-Commerce API` separate from `Internal Microservices`.
- **Client Isolation**: Freelancers or agencies can maintain distinct workspaces for different client projects.
- **Team Boundaries**: A workspace can be linked directly to a specific Git repository for team sync.

### Managing Workspaces

Click the workspace selector in the top-left area or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> and type `ws:` to jump between or create new workspaces.

---

## Collections & Nested Folders

Collections contain your API requests. RestIO supports arbitrarily deep folder nesting:

```text
📁 Customer API (Collection)   [Inherited Base URL: https://api.store.com/v1]
│
├── 📁 Customers (Folder)      [Inherited Auth: Bearer {{token}}]
│   ├── ⚡ GET  /customers
│   ├── ⚡ POST /customers
│   └── ⚡ GET  /customers/{{id}}
│
└── 📁 Orders (Folder)
    ├── ⚡ GET  /orders
    └── ⚡ POST /orders/checkout
```

---

## Hierarchical Property Inheritance

One of RestIO's most powerful features is **cascading inheritance**. Child requests automatically inherit configuration from their parent containers:

### 1. Base URL Inheritance

Instead of repeating `https://api.store.com/v1` across every request:

1. Open the collection or folder settings.
2. Define the **Base URL**:
   ```text
   {{base_url}}/v1
   ```
3. In child requests, enter only relative paths:
   ```text
   /customers/{{id}}
   ```

RestIO automatically prefixes the base URL, resolving the complete outbound endpoint:

```text
https://api.store.com/v1/customers/123
```

### 2. Authentication Inheritance

If you set **Bearer Token** authentication at the collection root:

- All nested folders and child requests default to **Inherit auth from parent**.
- If a specific endpoint is public (e.g. `/health` or `/login`), you can override auth on that single request by setting its Auth type to **No Auth**.

### 3. Shared Headers

Common headers (such as `Accept: application/json` or `X-Organization-ID`) defined on a parent folder cascade to all descendant requests automatically.

---

## Context Actions

Right-clicking any collection or folder in the sidebar unlocks rich context actions:

- **Run Collection / Folder**: Launches the [Automated Collection Runner](/restio/testing/collection-runner/).
- **Export OpenAPI**: Exports the hierarchy to standard OpenAPI 3.1 YAML or JSON.
- **Export Postman**: Exports to Postman Collection v2.1 format.
- **Git Sync / Share**: Publishes or pulls updates from a remote Git repository.
- **Duplicate**: Clones the container and all nested items.
