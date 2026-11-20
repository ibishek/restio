---
title: Security & Secret Hygiene
description: Keeping API keys, bearer tokens, and secrets secure and strictly local.
---

# Security & Secret Hygiene

Accidentally committing sensitive API tokens, production passwords, or OAuth credentials to public or shared Git repositories is one of the most common security breaches.

RestIO is architected from the ground up with **strict secret hygiene boundaries**.

---

## The Boundary: Shared vs. Local State

RestIO enforces a strict physical separation between shareable collection assets and sensitive local data:

| Asset Type                 | Storage Location      | Shareable via Git? | Notes                                                                                  |
| :------------------------- | :-------------------- | :----------------: | :------------------------------------------------------------------------------------- |
| **Collections & Requests** | Atomic JSON files     |      **Yes**       | Contains HTTP methods, relative paths, descriptions, headers, and test scripts.        |
| **Variable Placeholders**  | Atomic JSON files     |      **Yes**       | References like `{{base_url}}` or `{{auth_token}}` are shared without values.          |
| **Environment Values**     | Local SQLite Database |       **No**       | Values for `{{base_url}}` and `{{auth_token}}` are stored strictly on your local disk. |
| **Secret Variables**       | Encrypted SQLite      |       **No**       | Never exported or serialized to shareable collection files.                            |
| **Send History**           | Local SQLite          |       **No**       | Request snapshots and response bodies remain local.                                    |

---

## Best Practices for Teams

### 1. Always Mark Sensitive Variables as "Secret"

When adding variables such as `jwt_token`, `client_secret`, or `admin_api_key` in the Environment Editor:

- Check the **Secret** checkbox.
- The editor masks the value with asterisks (`••••••••`).
- Secret values are omitted from standard export bundles.

### 2. Use `rio.setEnv()` for Short-Lived Tokens

When authenticating against an OAuth or JWT endpoint, capture the token dynamically in your post-response script:

```javascript
// Post-response test script
rio.test("Extract Auth Token", () => {
  const data = rio.response.json();
  rio.setEnv("auth_token", data.access_token);
});
```

Because `auth_token` was populated at runtime into memory and local SQLite, it is available to subsequent requests during your session without being checked into Git.

### 3. Commit `.gitignore`

When committing collections inside a shared repo, ensure private configuration files are ignored:

```text
# Local RestIO cache and history
.restio/*.sqlite
.restio/*.sqlite-journal
.restio/local-env.json
```
