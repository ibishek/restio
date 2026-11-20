---
title: rio.* Scripting API Reference
description: Complete reference guide for all methods and properties available in RestIO scripting.
---

# `rio.*` Scripting API Reference

This page documents the complete API available in RestIO pre-request and post-response script sandboxes.

> **Aliases:** `io`, `am`, and `pm` (Postman compatibility) are registered aliases for `rio`.

---

## Environment & Variable Management

### `rio.environment.set(key, value)`

Sets a variable in the currently active environment.

- **Aliases:** `rio.setEnv(key, value)`, `pm.environment.set(key, value)`
- **Example:**
  ```javascript
  rio.environment.set("auth_token", "eyJhbGciOi...");
  rio.setEnv("user_id", 42);
  ```

### `rio.environment.get(key)`

Returns the value of an environment variable as a string, or `undefined` if not set.

- **Aliases:** `rio.getEnv(key)`, `pm.environment.get(key)`
- **Example:**
  ```javascript
  const baseUrl = rio.environment.get("base_url");
  ```

### `rio.environment.has(key)`

Returns `true` if the variable exists in the active environment.

- **Example:**
  ```javascript
  if (rio.environment.has("auth_token")) {
    console.log("Token already configured");
  }
  ```

### `rio.environment.unset(key)`

Removes a variable from the active environment.

- **Example:**
  ```javascript
  rio.environment.unset("temp_id");
  ```

---

## Test Registration & Assertions

### `rio.test(testName, fn)`

Registers a synchronous or asynchronous test assertion.

- **Aliases:** `pm.test(testName, fn)`
- **Example:**
  ```javascript
  rio.test("Verify successful status", () => {
    rio.response.to.have.status(200);
  });
  ```

### `rio.expect(actualValue)`

Chai-compatible assertion builder.

- **Aliases:** `pm.expect(actualValue)`
- **Examples:**
  ```javascript
  rio.expect(data.id).to.be.a("number");
  rio.expect(data.name).to.equal("Alice");
  rio.expect(data.roles).to.be.an("array").and.to.include("admin");
  rio.expect(rio.response.responseTime).to.be.below(500);
  ```

---

## HTTP Response Object (`rio.response`)

Available in **Post-response / Tests** scripts:

| Property / Method                         | Type       | Description                                       |
| :---------------------------------------- | :--------- | :------------------------------------------------ |
| `rio.response.code`                       | `number`   | Numeric HTTP status code (`200`, `404`, `500`)    |
| `rio.response.status`                     | `string`   | HTTP status reason string (`"OK"`, `"Not Found"`) |
| `rio.response.responseTime`               | `number`   | Total duration in milliseconds                    |
| `rio.response.json()`                     | `Function` | Parses response body string as JSON               |
| `rio.response.text()`                     | `Function` | Returns raw response body string                  |
| `rio.response.headers.get(name)`          | `Function` | Case-insensitive lookup of response header value  |
| `rio.response.to.have.status(code)`       | Assertion  | Asserts exact status code                         |
| `rio.response.to.have.header(name, val?)` | Assertion  | Asserts header presence or match                  |
| `rio.response.to.be.success`              | Assertion  | Asserts status code is `2xx`                      |
| `rio.response.to.be.clientError`          | Assertion  | Asserts status code is `4xx`                      |
| `rio.response.to.be.serverError`          | Assertion  | Asserts status code is `5xx`                      |

---

## Outbound HTTP Request Object (`rio.request`)

Available in **Pre-request** scripts:

| Property           | Type     | Description                                            |
| :----------------- | :------- | :----------------------------------------------------- |
| `rio.request.body` | `string` | Read or dynamically override the outgoing request body |
| `rio.request.url`  | `string` | Outbound URL string before interpolation               |

---

## Mock Data (`faker` / `rio.faker`)

Pre-bundled [`@faker-js/faker`](https://fakerjs.dev/) instance.

- **Examples:**
  ```javascript
  const email = faker.internet.email();
  const name = faker.person.fullName();
  const id = faker.string.uuid();
  ```

---

## Diagnostic Console

- `console.log(...args)`: Outputs informational message to the response Test Console.
- `console.warn(...args)`: Outputs warning message.
- `console.error(...args)`: Outputs error message.
