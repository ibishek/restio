---
title: OpenAPI & Swagger
description: Two-way OpenAPI 3.0, 3.1, and Swagger 2.0 import and export with schema synthesis.
---

# OpenAPI & Swagger Support

RestIO provides built-in, offline two-way compatibility with industry-standard OpenAPI and Swagger specifications in both **YAML** and **JSON** formats.

---

## Supported Versions

- **OpenAPI 3.1.x** (full support)
- **OpenAPI 3.0.x** (full support)
- **Swagger 2.0** (full support)

---

## Importing OpenAPI & Swagger Specs

You can import an existing specification via file drop or clipboard:

1. Click the **Import** button in the sidebar or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> and choose **Import OpenAPI / Swagger**.
2. Paste the raw specification text or drag and drop a `.yaml`, `.yml`, or `.json` file.
3. The real-time validator inspects the content:
   - Identifies specification format and version.
   - Displays API Title, Version, and server base URLs.
   - Counts the total number of HTTP endpoints found.
4. Select the target collection name and click **Import Collection**.

### Schema-to-Sample Synthesis

When importing endpoints that have JSON request schemas:

- RestIO recursively walks `$ref` schema definitions.
- Resolves primitive types (`string`, `integer`, `boolean`, `number`) and arrays.
- Handles combinators (`allOf`, `oneOf`, `anyOf`).
- Generates a realistic sample JSON body ready for immediate execution.

### Path Parameter Conversion

Paths using standard OpenAPI template syntax like `/users/{id}/orders/{order_id}` are automatically converted to RestIO variable tokens:

```text
/users/{{id}}/orders/{{order_id}}
```

This allows values to be supplied dynamically via active environments or pre-request scripts.

---

## Exporting to OpenAPI 3.1.0

Any RestIO collection can be exported to standard OpenAPI 3.1.0:

1. Right-click any collection in the sidebar and select **Export OpenAPI**.
2. Select your desired output format:
   - **YAML**
   - **JSON**
3. Click **Copy to Clipboard** or **Save to File**.

The exported specification includes all methods, query parameters, header definitions, authentication schemes, sample request bodies, and endpoint descriptions.
