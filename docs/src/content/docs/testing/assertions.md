---
title: Assertions & Expectations
description: Writing assertions using Chai-compatible expect syntax and response helpers.
---

# Assertions & Expectations

RestIO includes a built-in assertion engine powered by Chai-compatible `expect` syntax and high-level `rio.response` assertions.

---

## The `rio.test()` Function

All test assertions are grouped inside `rio.test(name, fn)`. Each test can be synchronous or asynchronous:

```javascript
rio.test("Status code is 200 OK", function () {
  rio.response.to.have.status(200);
});

rio.test("Async validation test", async function () {
  const json = rio.response.json();
  rio.expect(json.items.length).to.be.greaterThan(0);
});
```

---

## High-Level Response Matchers

RestIO provides intuitive shorthand assertions directly on `rio.response`:

### Status Code Checks

```javascript
// Assert exact status code
rio.response.to.have.status(200);
rio.response.to.have.status(201);

// Assert 2xx status family
rio.response.to.be.success;

// Assert 4xx client error family
rio.response.to.be.clientError;

// Assert 5xx server error family
rio.response.to.be.serverError;
```

### Header Checks

```javascript
// Check header presence
rio.response.to.have.header("content-type");

// Check header presence and exact/partial value
rio.response.to.have.header("content-type", "application/json");
```

---

## Chai-Compatible `rio.expect()` Matchers

For detailed validation of JSON payloads, data structures, and numbers, use `rio.expect()`:

```javascript
const body = rio.response.json();

// Type checks
rio.expect(body.id).to.be.a("number");
rio.expect(body.name).to.be.a("string");
rio.expect(body.roles).to.be.an("array");
rio.expect(body.active).to.be.a("boolean");

// Value comparisons
rio.expect(body.name).to.equal("Alice");
rio.expect(body.age).to.be.at.least(18);
rio.expect(body.score).to.be.within(0, 100);

// Property presence
rio.expect(body).to.have.property("email");
rio.expect(body).to.include.keys("id", "name", "email");

// Array contents
rio.expect(body.roles).to.include("admin");
rio.expect(body.tags).to.have.lengthOf(3);

// Regular expressions
rio.expect(body.email).to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

// Performance / Latency check
rio.expect(rio.response.responseTime).to.be.below(500); // ms
```

---

## Reading Response Data

| Method / Property                  | Description                                                | Return Type      |
| :--------------------------------- | :--------------------------------------------------------- | :--------------- |
| `rio.response.code`                | The numeric HTTP status code (e.g. `200`, `404`)           | `number`         |
| `rio.response.status`              | The HTTP status reason string (e.g. `"OK"`, `"Not Found"`) | `string`         |
| `rio.response.responseTime`        | Total round-trip execution latency in milliseconds         | `number`         |
| `rio.response.json()`              | Parses the body string as a JavaScript object              | `any`            |
| `rio.response.text()`              | Returns the raw, unparsed response body string             | `string`         |
| `rio.response.headers.get("name")` | Retrieves header value (case-insensitive lookup)           | `string \| null` |

---

## Test Results Display

When a request finishes:

1. Open the **Tests** tab in the **Response Panel**.
2. RestIO shows a summary badge (e.g. `Passed: 4 | Failed: 1`).
3. Failed tests display clear, highlighted diffs and assertion error messages (e.g., `AssertionError: expected 404 to equal 200`).
