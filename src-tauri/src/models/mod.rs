//! Serde structs that cross the IPC boundary. These mirror `#lib/types`
//! (see ARCHITECTURE.md §5) — keep the shapes in sync on both sides.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A workspace: the top-level container that scopes a set of collections and
/// environments (and, via Git, its members). Mirrors `#lib/types` `Workspace`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    /// Absolute path of this workspace's collections file (its Git-shareable location).
    pub collections_path: String,
    /// Id of this workspace's active environment ("" = none).
    pub active_env_id: String,
}

/// A workspace member, derived from the shared collections repo's Git authors.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub name: String,
    pub email: String,
    pub commits: u32,
}

/// One editable header / query-param row from the request editor.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub enabled: bool,
}

/// One field of a `multipart/form-data` body. Text fields carry a `value`; file
/// fields carry a `file_path` whose bytes Rust reads at send time — the path is
/// never persisted into shared collections (see ARCHITECTURE.md §8).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartField {
    #[serde(default)]
    pub key: String,
    /// `"text"` or `"file"`.
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub enabled: bool,
}

/// Bearer-token auth config.
#[derive(Debug, Default, Deserialize)]
pub struct BearerAuth {
    #[serde(default)]
    pub token: String,
}

/// HTTP Basic auth config.
#[derive(Debug, Default, Deserialize)]
pub struct BasicAuth {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

/// API-key auth config: a `key`/`value` sent either as a header or a query param.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyAuth {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    /// `"header"` or `"query"`.
    #[serde(default)]
    pub add_to: String,
}

/// Request authorization. `{{vars}}` in the values are resolved in the frontend
/// before this crosses IPC (ARCHITECTURE.md §7); the concrete config is applied
/// to the outbound request in `http::auth` (§6). Values are never mirrored back.
#[derive(Debug, Default, Deserialize)]
pub struct RequestAuth {
    /// `"none" | "bearer" | "basic" | "apikey"`.
    #[serde(default, rename = "type")]
    pub auth_type: String,
    #[serde(default)]
    pub bearer: BearerAuth,
    #[serde(default)]
    pub basic: BasicAuth,
    #[serde(default)]
    pub api_key: ApiKeyAuth,
}

/// A request composed in the UI. Unknown fields (id, name, …) are ignored.
///
/// The body shape depends on `body_mode`: `json`/`text` use `body`; `form` uses
/// `form_fields` (x-www-form-urlencoded); `multipart` uses `multipart`; `binary`
/// uses `binary_path` (a file read at send time). See `http::executor`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub body_mode: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub form_fields: Vec<KeyValue>,
    #[serde(default)]
    pub multipart: Vec<MultipartField>,
    #[serde(default)]
    pub binary_path: String,
    #[serde(default)]
    pub auth: RequestAuth,
    #[serde(default)]
    pub danger_accept_invalid_certs: bool,
    #[serde(default = "default_true")]
    pub use_cookie_jar: bool,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub test_script: Option<String>,
}

fn default_true() -> bool {
    true
}

/// A stored HTTP cookie. Scoped per workspace in SQLite.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Cookie {
    pub id: String,
    pub workspace_id: String,
    pub domain: String,
    pub path: String,
    pub name: String,
    pub value: String,
    pub http_only: bool,
    pub secure: bool,
    pub same_site: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_age: Option<i64>,
    pub created_at: i64,
}

/// The captured result of a round-trip, sent back to the UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub time_ms: u64,
    pub size_bytes: u64,
    pub headers: BTreeMap<String, String>,
    /// Response body. Text-ish bodies are UTF-8; binary bodies (images, etc.)
    /// are base64 — see `body_encoding`.
    pub body: String,
    /// `"utf8"` or `"base64"`.
    pub body_encoding: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_path: Option<String>,
    #[serde(default)]
    pub cookies: Vec<Cookie>,
}

/// A single streaming chunk emitted in real time to the frontend over a Tauri channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub index: usize,
    pub text: String,
    pub elapsed_ms: u64,
    pub bytes: usize,
}
