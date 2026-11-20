---
title: Automated Collection Runner
description: Execute multi-request automated test suites with request chaining and exportable summaries.
---

# Automated Collection Runner

The **Automated Collection Runner** enables you to run entire folders or collections sequentially as an end-to-end integration test suite.

```
+--------------------------------------------------------------------------+
|  Collection Runner: "E-Commerce Integration Suite"                       |
+--------------------------------------------------------------------------+
|  Environment: [ Production ▾ ]      Iterations: [ 3 ]   Delay: [ 100 ms] |
|  [x] Stop run on first failed test                                       |
+--------------------------------------------------------------------------+
|  EXECUTION QUEUE (Drag to reorder):                                      |
|  [x] 1. POST  /auth/login          --> captures {{auth_token}}           |
|  [x] 2. GET   /products            --> extracts first {{product_id}}      |
|  [x] 3. POST  /cart/items          --> adds item to cart                 |
|  [x] 4. POST  /checkout            --> verifies 201 Created              |
+--------------------------------------------------------------------------+
|  [ Start Run ]                                                           |
+--------------------------------------------------------------------------+
```

---

## Launching the Runner

1. In the sidebar, right-click any collection or folder.
2. Select **Run Collection** or **Run Folder**.
3. The Collection Runner modal opens.

---

## Configuration Options

| Option                | Description                                                                            |
| :-------------------- | :------------------------------------------------------------------------------------- |
| **Environment**       | Select which environment variables to use during the execution.                        |
| **Iterations**        | Number of times the entire queue should repeat (useful for load or regression checks). |
| **Delay (`delayMs`)** | Milliseconds of pause between requests to prevent hitting server rate limits.          |
| **Stop on Failure**   | Immediately halts execution if an assertion inside `rio.test()` fails.                 |
| **Request Selection** | Toggle checkboxes to include or omit specific endpoints from the run.                  |
| **Reorder Queue**     | Drag and drop requests to modify execution order.                                      |

---

## Dynamic Variable Chaining

The true power of the runner is **request chaining**: variables set in earlier steps automatically feed into subsequent requests.

### Example: Complete User Journey

1. **Request 1: `POST /api/auth/login`**
   ```javascript
   // Post-response test script:
   rio.test("Login success", () => {
     rio.response.to.have.status(200);
     const data = rio.response.json();
     // Set token for subsequent steps
     rio.setEnv("auth_token", data.token);
   });
   ```
2. **Request 2: `GET /api/user/profile`**
   - URL: `{{base_url}}/api/user/profile`
   - Header: `Authorization: Bearer {{auth_token}}`
   - Tests verify user permissions.
3. **Request 3: `POST /api/orders`**
   - Uses profile IDs and auth token from Steps 1 and 2.

---

## Live Results & Reporting

As the runner executes, RestIO streams live statistics:

- **KPI Metrics**: Total Requests Executed, Tests Passed, Tests Failed, Total Duration, and Average Latency.
- **Per-Request Breakdown**: Real-time status indicators with expandable logs showing individual assertion pass/fail results.
- **Export Summary**: Click **Export JSON Summary** to copy a structured machine-readable test report to your clipboard.
