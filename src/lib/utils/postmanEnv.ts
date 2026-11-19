// Postman Environment v2.1 ⇄ our Environment. Pure and dependency-free — the
// portable interchange format for named `{{var}}` sets (companion to the
// collection converter in `./postman.ts`). Postman uses the same `{{var}}`
// reference syntax, so variable keys pass through unchanged. Import is tolerant
// of partial/loose input; export emits the shape the Postman app expects.

import type { Environment, KeyValue } from "#lib/types";

const uid = (): string => crypto.randomUUID();
const kv = (key = "", value = "", enabled = true): KeyValue => ({ id: uid(), key, value, enabled });

// ── Export ───────────────────────────────────────────────────────────────────

interface PmValue {
  key: string;
  value: string;
  type: "default";
  enabled: boolean;
}
export interface PostmanEnvironment {
  id: string;
  name: string;
  values: PmValue[];
  _postman_variable_scope: "environment";
  _postman_exported_using: "RestIO";
}

/** Convert one of our environments to a Postman v2.1 environment. Drops empty
 *  rows (the trailing blank the editor keeps for input). */
export function toPostmanEnvironment(env: Environment): PostmanEnvironment {
  return {
    id: uid(),
    name: env.name,
    values: env.variables
      .filter((v) => v.key)
      .map((v) => ({ key: v.key, value: v.value, type: "default", enabled: v.enabled })),
    _postman_variable_scope: "environment",
    _postman_exported_using: "RestIO",
  };
}

// ── Import ───────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = Record<string, any>;

/** Parse a Postman v2.1 environment (object or JSON string) into our shape, or
 *  `null` if it doesn't look like a Postman environment. Always leaves a
 *  trailing blank row so it drops straight into the editor grid. */
export function fromPostmanEnvironment(input: unknown): Environment | null {
  let json: Any;
  if (typeof input === "string") {
    try {
      json = JSON.parse(input);
    } catch {
      return null;
    }
  } else if (input && typeof input === "object") {
    json = input as Any;
  } else {
    return null;
  }
  // A Postman environment is identified by its `values` array; the collection
  // format uses `item` instead, so this won't misfire on a collection.
  if (!Array.isArray(json.values) || json["_postman_variable_scope"] === "collection") return null;

  const variables = json.values
    .filter((v: unknown) => v && typeof v === "object")
    .map((v: Any) =>
      kv(String(v.key ?? ""), String(v.value ?? ""), v.enabled !== false && v.disabled !== true),
    );
  return {
    id: uid(),
    name: String(json.name ?? "Imported environment"),
    variables: [...variables, kv()],
  };
}
