---
title: Postman Interchange
description: Migrate seamlessly to and from Postman v2.1 collections and environments.
---

# Postman Interchange

RestIO provides first-class compatibility with the Postman ecosystem. You can migrate existing collections, folders, and environment files directly into RestIO without losing scripts or configurations.

---

## Importing Postman Collections (v2.1)

1. In Postman, export your collection as **Collection v2.1 (recommended)**.
2. In RestIO, click **Import** or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> and select **Import Postman Collection**.
3. Select the exported `.json` file.
4. RestIO reconstructs:
   - Full nested folder hierarchy.
   - Method, URL, headers, and query parameters.
   - Body contents (`raw JSON`, `urlencoded`, `form-data`).
   - Pre-request and test scripts (automatically aliased to work with RestIO's `rio.*` runtime).
   - Authorization configurations (Bearer, Basic, API Key).

---

## Importing Postman Environments

1. In Postman, go to **Environments** and export your environment file.
2. In RestIO, open the **Environment Editor** and click **Import Postman Environment**.
3. All keys, values, and secret statuses are parsed directly into an active RestIO environment.

---

## Exporting to Postman Format

Need to share a collection with a colleague who hasn't installed RestIO yet?

1. Right-click the collection in the sidebar and choose **Export Postman Collection**.
2. RestIO generates a clean Postman Collection v2.1 JSON file compatible with Postman desktop, web, or CLI runners (`newman`).
