---
title: Environments & Variables
description: Dynamic variable interpolation, environments, inline autocomplete, and resolved URL preview.
---

# Environments & Variables

RestIO allows you to author portable requests using `{{variable}}` placeholders. Variables can be swapped instantly across **Local**, **Development**, **Staging**, and **Production** environments.

---

## How Variable Interpolation Works

Any string enclosed in double curly braces `{{var_name}}` is interpolated at send time:

- **In the URL**: `{{base_url}}/api/v2/users/{{user_id}}`
- **In Query Parameters**: `filter={{active_status}}`
- **In Headers**: `Authorization: Bearer {{auth_token}}`
- **In Request Bodies**:
  ```json
  {
    "username": "{{test_username}}",
    "role": "{{default_role}}"
  }
  ```

---

## Managing Environments

Click the **Environment Selector** in the top navigation bar or press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> and type `env:`.

```
+-------------------------------------------------------------------+
| Configure Environments                                            |
+-------------------------------------------------------------------+
|  ENVIRONMENTS        |  VARIABLES FOR "Staging"                   |
|                      |                                            |
|  * Development       |  Key          | Value            | Secret  |
|  * Staging (active)  |  base_url     | https://stg.api  | [ ]     |
|  * Production        |  api_key      | **************   | [x]     |
|                      |  org_id       | org_98765        | [ ]     |
+-------------------------------------------------------------------+
```

### Secret Variables

When creating a variable containing sensitive credentials (API tokens, private keys, passwords), check the **Secret** checkbox:

- The value is masked with `••••••••` in the UI to prevent shoulder-surfing.
- Secret values are stored strictly in local SQLite and are **never exported or committed to Git**.

---

## Editor Features for Variables

### 1. Real-Time Resolved URL Preview

Authoring nested variables can make it hard to visualize the final URL. RestIO features a **Resolved URL Preview Bar** directly below the main address input:

```text
URL:      {{base_url}}/users/{{user_id}}?role={{role}}
Preview:  https://api.production.com/users/42?role=admin
```

Click the copy button on the preview bar to copy the concrete resolved string to your clipboard.

### 2. Inline Autocomplete (`{{`)

When typing inside any URL, parameter, or header field, entering `{{` displays an autocomplete popup:

- Lists all variables defined in the active environment.
- Displays their current resolved values.
- Press <kbd>Tab</kbd> or <kbd>Enter</kbd> to insert.

### 3. Hover Value Tooltips

Hover your cursor over any `{{variable_name}}` pill inside the editor to view a tooltip showing:

- Variable name
- Current active value
- Source environment

---

## Dynamic Runtime Variables

In addition to static environment configurations, variables can be created or updated programmatically during execution using the [Scripting API](/testing/scripting/):

```javascript
// Pre-request: generate a dynamic timestamp
rio.setEnv("current_timestamp", Date.now().toString());

// Post-response: capture an auth token from login response
const body = rio.response.json();
rio.setEnv("auth_token", body.access_token);
```

Variables set via `rio.setEnv()` immediately become available to subsequent requests in the workspace or collection runner.
