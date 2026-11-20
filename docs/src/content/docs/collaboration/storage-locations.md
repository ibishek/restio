---
title: Storage Locations & Paths
description: Where RestIO persists collections, local SQLite databases, and cache on macOS, Windows, and Linux.
---

# Storage Locations & File Paths

RestIO follows standard desktop operating system guidelines for application data storage.

---

## Operating System Directory Paths

RestIO stores all data in your operating system's standard application support directory under the identifier `com.ibishek.restio` (or `com.ambition.restio`):

| Operating System | Path                                                                                         |
| :--------------- | :------------------------------------------------------------------------------------------- |
| **Linux**        | `~/.local/share/com.ibishek.restio/`                                                         |
| **macOS**        | `~/Library/Application Support/com.ibishek.restio/`                                          |
| **Windows**      | `%APPDATA%\com.ibishek.restio\` (e.g. `C:\Users\<User>\AppData\Roaming\com.ibishek.restio\`) |

---

## Directory Structure Breakdown

Inside the application directory, you will find:

```text
com.ibishek.restio/
├── collections/                  # Shared Collection JSON files (suitable for Git)
│   ├── e-commerce-api.json
│   └── internal-services.json
├── db.sqlite                     # Local SQLite database (Secrets, History, State)
├── db.sqlite-wal                 # SQLite Write-Ahead Log
├── db.sqlite-shm                 # SQLite Shared Memory index
└── workspaces.json               # Local workspace configuration & tab layouts
```

---

## File Types & Responsibilities

### 1. `collections/*.json` (Atomic JSON)

- Stores the hierarchy of collections, folders, HTTP requests, query params, headers, test scripts, and saved response examples.
- Formatted with sorted keys and consistent whitespace so that version control diffs in Git are clean and minimal.
- **Safe to share via Git**: Contains variable placeholders like `{{token}}`, but never the real secret values.

### 2. `db.sqlite` (Local SQLite 3)

- Stores sensitive information that must never leak to version control:
  - Environment variable values (especially variables marked as **Secret**).
  - Send history records and execution logs.
  - Local Git credentials and branch metadata.

---

## Backing Up or Migrating RestIO

### Manual Backup

To create a complete backup of your RestIO data:

```bash
# On Linux / macOS:
cp -r "$HOME/.local/share/com.ibishek.restio" ~/restio-backup
```

### Complete Reset

If you want to reset RestIO to a factory state:

```bash
# Delete local state (Collections in separate Git directories will NOT be deleted)
rm -rf ~/.local/share/com.ibishek.restio
```

When you relaunch RestIO, it will automatically recreate a fresh workspace with default starter examples.
