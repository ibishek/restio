---
title: Send History & Tabs
description: Managing multi-tab workflows, unsaved change tracking, and the SQLite send history log.
---

# Send History & Tabs

RestIO provides a desktop-grade tab management system and a local SQLite-backed request history.

---

## 1. Multi-Tab Management

The tab strip at the top of the workbench allows you to keep multiple requests open simultaneously without losing work.

```
+--------------------------------------------------------------------------+
| [⚡ GET Users]  [⚡ POST Orders •]  [⚡ GET /health]              [+ New Tab] |
+--------------------------------------------------------------------------+
```

### Unsaved Change Indicators (`•` Dot)

- When you modify a request URL, header, body, or script, an **indicator dot (`•`)** appears on the tab label.
- Press <kbd>⌘S</kbd> / <kbd>Ctrl+S</kbd> to persist changes immediately to the collection JSON.
- Closing a dirty tab prompts a confirmation dialog so you never lose in-flight edits.

### Tab Navigation Shortcuts

| Action        | macOS                            | Windows / Linux                  |
| :------------ | :------------------------------- | :------------------------------- |
| **New Tab**   | <kbd>⌘</kbd> + <kbd>N</kbd>      | <kbd>Ctrl</kbd> + <kbd>N</kbd>   |
| **Close Tab** | <kbd>⌘</kbd> + <kbd>W</kbd>      | <kbd>Ctrl</kbd> + <kbd>W</kbd>   |
| **Save Tab**  | <kbd>⌘</kbd> + <kbd>S</kbd>      | <kbd>Ctrl</kbd> + <kbd>S</kbd>   |
| **Next Tab**  | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> | <kbd>Ctrl</kbd> + <kbd>Tab</kbd> |

---

## 2. Send History

Every time you execute an HTTP request, RestIO logs an immutable snapshot to a local **SQLite database** (`history` table).

### Accessing History

1. Click the **History** tab in the left sidebar or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> and type `hist:`.
2. History entries display:
   - **HTTP Method Badge** (`GET`, `POST`, `DELETE`, etc.)
   - **Target URL**
   - **Status Code** (color-coded: green for `2xx`, yellow for `3xx`, red for `4xx`/`5xx`)
   - **Execution Latency** (e.g. `124 ms`)
   - **Timestamp** (e.g. `2 minutes ago`, `Yesterday`)

### Filtering & Restoring

- **Search Filter**: Search by path (e.g. `/checkout`), status code (`200`), or domain.
- **Method Filter**: Filter exclusively by `POST`, `GET`, etc.
- **1-Click Restore**: Click any history entry to open it as a fresh tab in the workbench with the exact headers and body that were sent.

### Clearing History

To preserve disk space or remove past test records, click **Clear History** at the top of the history sidebar. This truncates the SQLite history table for the active workspace.
