---
title: Command Palette & Navigation
description: Spotlight-style keyboard-first navigation with prefix filters and focus trapping.
---

# Command Palette & Navigation

RestIO is designed for keyboard-first developer productivity. The **Command Palette** allows you to navigate anywhere, execute workbench commands, switch environments, and search history in seconds.

Press <kbd>⌘K</kbd> (macOS) or <kbd>Ctrl+K</kbd> (Windows/Linux) anytime to open the palette.

---

## Quick Category Filter Prefixes

Type a prefix at the start of the search input to filter items by category:

| Prefix        | Filter Mode      | Example                                               |
| :------------ | :--------------- | :---------------------------------------------------- |
| `>` or `cmd:` | **Commands**     | `> Send request`, `> New request`, `> Export OpenAPI` |
| `/` or `req:` | **Requests**     | `/users`, `/login`, `/v2/orders`                      |
| `hist:`       | **Send History** | `hist: 200 OK`, `hist: stripe`                        |
| `env:`        | **Environments** | `env: Production`, `env: Staging`                     |
| `ws:`         | **Workspaces**   | `ws: Billing`, `ws: Mobile API`                       |

---

## Common Built-in Commands

| Command                           | Description                                                                                     | Shortcut                                  |
| :-------------------------------- | :---------------------------------------------------------------------------------------------- | :---------------------------------------- |
| **Send active request**           | Dispatches the currently focused request tab                                                    | <kbd>⌘Enter</kbd> / <kbd>Ctrl+Enter</kbd> |
| **New request**                   | Opens a blank HTTP request tab                                                                  | <kbd>⌘T</kbd> / <kbd>Ctrl+T</kbd>         |
| **New SSE / stream request**      | Creates a new tab pre-configured with `Accept: text/event-stream` and `Cache-Control: no-cache` |                                           |
| **Add SSE headers to active tab** | Injects SSE streaming headers into the current active request tab                               |                                           |
| **Close active tab**              | Closes the current request tab                                                                  | <kbd>⌘W</kbd> / <kbd>Ctrl+W</kbd>         |
| **Open environment manager**      | Opens the active environment variable editor                                                    | <kbd>⌘E</kbd> / <kbd>Ctrl+E</kbd>         |
| **Run active collection**         | Launches the collection test runner                                                             | <kbd>⌘R</kbd> / <kbd>Ctrl+R</kbd>         |
| **Import OpenAPI / Postman**      | Opens the specification import modal                                                            | <kbd>⌘O</kbd> / <kbd>Ctrl+O</kbd>         |
| **Export collection as OpenAPI**  | Exports the active collection as OpenAPI 3.1 JSON                                               |                                           |

---

## Navigation & Shortcuts

- <kbd>↑</kbd> / <kbd>↓</kbd> — Move selection up or down.
- <kbd>Enter</kbd> — Open selected request, switch environment, or execute action.
- <kbd>Esc</kbd> — Close the Command Palette and restore focus to your prior active element.

---

## Universal Accessible Focus Trapping

All dialogs in RestIO (Command Palette, Environment Editor, Collection Runner, OpenAPI modal) implement strict keyboard focus management via `use:focusTrap`:

- Pressing <kbd>Tab</kbd> or <kbd>Shift+Tab</kbd> cycles strictly within the active dialog without leaking focus to background controls.
- Focused items feature high-contrast, border-hugging inset outlines.
- Closing a dialog automatically returns keyboard focus to the triggering element.
