---
title: Git-Backed Sharing
description: Collaborate on API collections using pure Git repositories without vendor lock-in.
---

# Git-Backed Sharing

RestIO's core differentiator is that **API collections can be versioned and shared across team members using standard Git repositories**.

Instead of paying for closed proprietary team clouds, your team uses Git — the same revision control system you already trust for your source code.

```
+------------------+         Git Remote         +------------------+
|  Developer A     |   (GitHub / GitLab / etc)  |  Developer B     |
|  RestIO Client   |                            |  RestIO Client   |
|                  |     git push / git pull    |                  |
|  [Collection]    | <========================> |  [Collection]    |
|  (orders.json)   |                            |  (orders.json)   |
|                  |                            |                  |
|  [Local SQLite]  |   (Secrets never shared)   |  [Local SQLite]  |
|  (tokens, keys)  |                            |  (tokens, keys)  |
+------------------+                            +------------------+
```

---

## How It Works

1. **Deterministic JSON Files**: Collections and folders are serialized to clean, deterministic JSON files formatted with sorted keys. This prevents noisy line diffs in Git.
2. **Branching & Pull Requests**: When adding or updating API endpoints, create a branch in your repository. Teammates can review API changes, schema additions, and test assertions in a standard GitHub/GitLab Pull Request.
3. **Pull & Sync**: RestIO detects when the underlying files are updated and automatically refreshes the sidebar workbench with zero data corruption.

---

## Setting Up Git Sharing for a Collection

### Step 1: Initialize or Select a Repository

You can keep your RestIO collections in:

- The **same repository** as your backend codebase (e.g., in an `api/` or `.restio/` directory).
- A **dedicated team repository** (e.g., `github.com/my-org/api-collections`).

### Step 2: Connect Collection in RestIO

1. Right-click your collection in the sidebar and select **Git Sync / Share**.
2. Select or enter the local directory path where the collection file should reside.
3. RestIO writes the collection structure to disk.

### Step 3: Commit and Push

From your terminal or Git GUI:

```bash
git add collections/
git commit -m "feat(api): add v2 checkout endpoints and test assertions"
git push origin main
```

When your teammates run `git pull`, RestIO updates the collection in their sidebar.

---

## Handling Merge Conflicts

Because RestIO uses UUID-keyed objects and ordered JSON arrays, conflicts are rare. If two developers edit the same endpoint simultaneously:

- Standard Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) apply to the JSON file.
- Once the conflict is resolved in your code editor or Git tool, RestIO parses the resolved JSON and resumes syncing.
