---
title: Quickstart
description: Compose and send your first API request in RestIO within 2 minutes.
---

# RestIO Quickstart

Welcome to RestIO! In this guide, you will learn how to:

1. Create a workspace and collection.
2. Build and execute your first HTTP request.
3. Use environment variables with real-time resolved URL previews.
4. Inspect headers, response bodies, and timing.
5. Add an automated test assertion.

---

## Step 1: Launch RestIO and Explore the Interface

When you open RestIO, you will see the three primary zones of the **Workbench**:

```
+--------------------------------------------------------------------------+
|  [⚡ RestIO]    [Search Requests or ⌘K]                 [Dev Environment ▾] |
+--------------------------------------------------------------------------+
|  COLLECTIONS          |  REQUEST BUILDER            |  RESPONSE PANEL     |
|                       |                             |                     |
|  📁 Quickstart API    |  GET  https://httpbin.org/  |  Status: 200 OK     |
|    └ ⚡ Get Status    |       get?user={{user_id}}  |  Time: 124 ms       |
|    └ ⚡ Create User   |  -------------------------  |  Size: 452 B        |
|                       |  [Resolved URL Preview]     |  -----------------  |
|                       |  https://httpbin.org/get... |  [Body] [Headers]   |
|                       |                             |  [Tests (1/1)]      |
+--------------------------------------------------------------------------+
```

1. **Left Sidebar**: Manages collections, nested folders, saved requests, active workspaces, and past send history.
2. **Center Panel (Request Builder)**: Configure HTTP method, request URL, query parameters, headers, auth, body (JSON, form-data, urlencoded), and pre/post scripts.
3. **Right Panel (Response Viewer)**: Displays HTTP status codes, latency metrics, response sizes, formatted bodies (JSON/HTML/text), response headers, server timings, and test results.

---

## Step 2: Create a Collection and Request

1. In the sidebar, click the **+** button next to **Collections**.
2. Name your collection `HTTP Testing`.
3. Hover over your newly created collection and click **+ New Request**.
4. Name the request `Fetch JSON Data`.

---

## Step 3: Configure and Send a Request

1. Set the HTTP method to **GET** using the dropdown.
2. Enter the URL:
   ```text
   https://httpbin.org/json
   ```
3. Click the **Send** button or press <kbd>⌘</kbd> + <kbd>Enter</kbd> (Mac) / <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (Windows/Linux).

RestIO executes the request via its Rust backend. Within milliseconds, the **Response Panel** displays:

- Status code badge: `200 OK`
- Response time (e.g. `118 ms`)
- Response payload size (e.g. `429 B`)
- Formatted JSON body with syntax highlighting and copy buttons

---

## Step 4: Add Environment Variables & Resolved URL Preview

Instead of hardcoding domain names or IDs, use RestIO's multi-environment variable interpolation:

1. Click the **Environment Selector** in the top-right header and select **Configure Environments**.
2. Click **+ Add Environment** and call it `Production`.
3. Add two key-value pairs:
   - `base_url`: `https://httpbin.org`
   - `api_version`: `v1`
4. Close the modal and ensure `Production` is selected as the active environment.
5. In your request URL, update the address to:
   ```text
   {{base_url}}/get?version={{api_version}}
   ```

Notice the **Resolved URL Preview Bar** directly under the input:

```text
Resolved: https://httpbin.org/get?version=v1
```

RestIO dynamically interpolates variables in real time. You can click the copy icon on the preview bar to copy the exact outgoing string.

---

## Step 5: Write Your First Automated Test

RestIO includes an integrated JavaScript test runtime accessible from the **Tests** tab in the request builder.

1. Click the **Tests** tab in the request editor.
2. Enter the following test script:

```javascript
// Verify HTTP status code
rio.test("Status is 200 OK", function () {
  rio.response.to.have.status(200);
});

// Verify JSON payload structure
rio.test("Returned correct version query", function () {
  const json = rio.response.json();
  rio.expect(json.args.version).to.equal("v1");
});

// Verify response performance
rio.test("Latency is within threshold", function () {
  rio.expect(rio.response.responseTime).to.be.below(1000);
});
```

3. Press **Send** again.
4. In the response panel, click on the **Tests** tab. You will see a live breakdown:
   ```text
   Passed: 3 | Failed: 0
   ✓ Status is 200 OK (2ms)
   ✓ Returned correct version query (1ms)
   ✓ Latency is within threshold (1ms)
   ```

---

## Where to Go Next

- Learn how [Workspaces & Collections](/restio/core/workspaces-collections/) organize complex projects.
- Understand the unrestricted [Rust HTTP Engine](/restio/core/http-engine/).
- Sync your team's collections with [Git-Backed Sharing](/restio/collaboration/git-sync/).
- Explore advanced test automation and mock data with [Scripting Runtime](/restio/testing/scripting/).
