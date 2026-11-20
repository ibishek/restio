---
title: Code Generation
description: Export any HTTP request into production-ready code snippets across 16 programming languages.
---

# Code Generation

RestIO includes an integrated code generator that translates any configured request into production-ready code across **16 different programming languages and libraries**.

```
+-------------------------------------------------------------------+
|  Generate Code Snippet                                            |
+-------------------------------------------------------------------+
|  Target: [ cURL ▾ ]                                 [ Copy Code ] |
+-------------------------------------------------------------------+
|  curl -X POST "https://api.store.com/v1/checkout" \               |
|    -H "Content-Type: application/json" \                          |
|    -H "Authorization: Bearer my-secret-token" \                   |
|    -d '{                                                          |
|      "productId": 101,                                            |
|      "quantity": 2                                                |
|    }'                                                             |
+-------------------------------------------------------------------+
```

---

## How to Generate Code

1. In the request editor, configure your URL, headers, query parameters, auth, and request body.
2. Click the **Code (`</>`)** button in the request header or press <kbd>⌘K</kbd> and select **Generate Code**.
3. Choose your target language or HTTP library from the dropdown.
4. Click **Copy Code** to copy the generated snippet to your clipboard.

---

## Supported Target Languages & Libraries

| Language / Tool             | Library / Target                                         |
| :-------------------------- | :------------------------------------------------------- |
| **Shell**                   | `cURL`, `HTTPie`, `Wget`                                 |
| **JavaScript / TypeScript** | `Fetch API`, `Axios`, `Node.js (http)`, `XMLHttpRequest` |
| **Python**                  | `Requests`, `http.client`                                |
| **Go**                      | `net/http`                                               |
| **Rust**                    | `reqwest`                                                |
| **PHP**                     | `cURL`, `Guzzle`                                         |
| **Java**                    | `HttpClient`, `OkHttp`                                   |
| **Ruby**                    | `Net::HTTP`                                              |
| **C# (.NET)**               | `HttpClient`                                             |
| **Dart / Flutter**          | `http`                                                   |
| **Swift**                   | `URLSession`                                             |

---

## Environment Variable Resolution in Code

When generating code, you can toggle whether variables (`{{base_url}}`, `{{token}}`) should be:

- **Pre-evaluated**: Replaces all `{{variable}}` placeholders with their concrete values from the active environment.
- **Preserved**: Retains the placeholder string syntax for template embedding.
