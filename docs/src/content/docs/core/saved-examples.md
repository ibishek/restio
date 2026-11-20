---
title: Saved Response Examples
description: Capture real HTTP responses as offline examples and mock blueprints.
---

# Saved Response Examples

In RestIO, you can capture any real HTTP response and save it as an **Example** attached directly to the request.

Examples serve as **living documentation** and **mock blueprints**: teammates can inspect expected payloads, status codes, and headers without needing access to a live backend or database.

```
+-------------------------------------------------------------------+
|  [⚡ GET] /api/v2/orders/101                    [Viewing: 200 OK ▾]|
+-------------------------------------------------------------------+
|  Active Example: "200 OK - Standard Order Response"               |
|  [ Switch to Live Request ]  [ Rename Example ]  [ Delete ]       |
+-------------------------------------------------------------------+
|  Status: 200 OK      Size: 842 B      Saved: 2 mins ago           |
+-------------------------------------------------------------------+
|  {                                                                |
|    "id": 101,                                                    |
|    "status": "COMPLETED",                                         |
|    "items": [{ "sku": "WIDGET-1", "price": 49.99 }]              |
|  }                                                                |
+-------------------------------------------------------------------+
```

---

## Why Use Saved Examples?

- **Frontend & Backend Handoff**: Backend developers can execute an endpoint once and save typical responses (`200 OK`, `400 Bad Request`, `401 Unauthorized`) for frontend developers to build against.
- **Offline Development**: View complete payloads, response structures, and headers on a plane or when backend microservices are offline.
- **Git Versioning**: Saved examples are serialized cleanly into the collection's JSON file and version controlled via Git alongside your requests.

---

## How to Save and Manage Examples

### 1. Save an Example

1. Configure and send any HTTP request.
2. In the top-right corner of the **Response Panel**, click **Save Response** (or click the chevron next to Send and choose **Save as Example**).
3. Name your example (e.g., `200 OK - Active Subscription` or `404 - User Not Found`).
4. The example is immediately saved to disk.

### 2. Browse and Inspect Examples

1. When viewing a request that has saved examples, an **Examples Dropdown** appears in the request header bar.
2. Click the dropdown to switch between saved snapshots.
3. The response viewer switches into **Example Mode** (indicated by an amber banner), displaying the saved status, body, headers, and timestamp.

### 3. Return to Live Mode

Click **Exit Example** or **Live Request** in the header banner to return to sending real network requests.
