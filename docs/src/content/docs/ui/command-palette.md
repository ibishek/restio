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
