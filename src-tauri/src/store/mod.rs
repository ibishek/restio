//! Local persistence (ARCHITECTURE.md §6).
//!
//! - **Collections** live as a JSON file at a user-defined path (so they can be
//!   Git-tracked/shared, §8) — read/written here via [`read_json`] /
//!   [`write_json_atomic`]. Kept opaque: the frontend owns the shape.
//! - **Environments, history, and user settings** live in SQLite ([`db`]).
//!
//! File writes are atomic (temp file + rename) to avoid corruption on crash.

pub mod db;

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

/// Default file name for the collections document (under `app_data_dir()`).
pub const COLLECTIONS_FILE: &str = "collections.json";

/// Read a JSON document from `path`, or `Value::Null` if the file is absent.
pub fn read_json(path: &Path) -> Result<Value, AppError> {
    if !path.exists() {
        return Ok(Value::Null);
    }
    let raw = fs::read_to_string(path).map_err(|e| AppError::Storage(e.to_string()))?;
    serde_json::from_str(&raw).map_err(|e| AppError::Storage(e.to_string()))
}

/// Write a JSON document to `path` atomically (temp file + rename), creating
/// the parent directory if needed.
pub fn write_json_atomic(path: &Path, value: &Value) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::Storage(e.to_string()))?;
    }
    let tmp = path.with_extension("json.tmp");
    let body = serde_json::to_string_pretty(value).map_err(|e| AppError::Storage(e.to_string()))?;
    fs::write(&tmp, body).map_err(|e| AppError::Storage(e.to_string()))?;
    fs::rename(&tmp, path).map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(())
}

pub fn download_path_for(
    app: Option<&AppHandle>,
    content_type: &str,
) -> Result<std::path::PathBuf, AppError> {
    let dir = if let Some(app) = app {
        app.path()
            .download_dir()
            .or_else(|_| app.path().app_data_dir())
            .map_err(|e| AppError::Storage(e.to_string()))?
    } else {
        std::env::temp_dir()
    };
    fs::create_dir_all(&dir).map_err(|e| AppError::Storage(e.to_string()))?;

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    Ok(dir.join(format!("restio-response-{stamp}.{}", ext_for(content_type))))
}

/// Write a response body to the user's Downloads folder (falling back to the
/// app data dir) and return the full path. Used when a response is too large to
/// render safely in the webview. `body` is base64 when `encoding == "base64"`.
pub fn save_download(
    app: &AppHandle,
    body: &str,
    encoding: &str,
    content_type: &str,
) -> Result<String, AppError> {
    let path = download_path_for(Some(app), content_type)?;

    let bytes = if encoding == "base64" {
        base64::engine::general_purpose::STANDARD
            .decode(body)
            .map_err(|e| AppError::Storage(e.to_string()))?
    } else {
        body.as_bytes().to_vec()
    };

    fs::write(&path, bytes).map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Save a response body or copy an existing streamed file to a user-specified destination path.
pub fn save_to_path(
    dest_path: &str,
    body: Option<&str>,
    encoding: Option<&str>,
    source_file: Option<&str>,
) -> Result<String, AppError> {
    let dest = Path::new(dest_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| AppError::Storage(e.to_string()))?;
        }
    }

    if let Some(src) = source_file {
        if !src.is_empty() && Path::new(src).exists() {
            fs::copy(src, dest).map_err(|e| AppError::Storage(e.to_string()))?;
            return Ok(dest_path.to_string());
        }
    }

    if let Some(b) = body {
        let bytes = if encoding == Some("base64") {
            base64::engine::general_purpose::STANDARD
                .decode(b)
                .map_err(|e| AppError::Storage(e.to_string()))?
        } else {
            b.as_bytes().to_vec()
        };
        fs::write(dest, bytes).map_err(|e| AppError::Storage(e.to_string()))?;
        return Ok(dest_path.to_string());
    }

    Err(AppError::Storage(
        "No body or source file provided to save".into(),
    ))
}

/// Best-effort file extension for a Content-Type.
pub fn ext_for(content_type: &str) -> &'static str {
    let ct = content_type.to_lowercase();
    if ct.contains("json") {
        "json"
    } else if ct.contains("html") {
        "html"
    } else if ct.contains("svg") {
        "svg"
    } else if ct.contains("xml") {
        "xml"
    } else if ct.contains("javascript") || ct.contains("ecmascript") {
        "js"
    } else if ct.contains("css") {
        "css"
    } else if ct.contains("csv") {
        "csv"
    } else if ct.starts_with("image/png") {
        "png"
    } else if ct.starts_with("image/jpeg") {
        "jpg"
    } else if ct.starts_with("image/gif") {
        "gif"
    } else if ct.starts_with("image/webp") {
        "webp"
    } else if ct.starts_with("image/svg") {
        "svg"
    } else if ct.starts_with("application/pdf") {
        "pdf"
    } else if ct.starts_with("text/") {
        "txt"
    } else {
        "bin"
    }
}

#[cfg(test)]
mod tests {
    use super::{ext_for, save_to_path};

    #[test]
    fn maps_content_types_to_extensions() {
        assert_eq!(ext_for("application/json; charset=utf-8"), "json");
        assert_eq!(ext_for("text/html"), "html");
        assert_eq!(ext_for("image/png"), "png");
        assert_eq!(ext_for("image/jpeg"), "jpg");
        assert_eq!(ext_for("application/octet-stream"), "bin");
        assert_eq!(ext_for(""), "bin");
    }

    #[test]
    fn saves_utf8_and_base64_and_file_to_path() {
        let tmp_dir = std::env::temp_dir().join(format!("restio_test_{}", std::process::id()));
        let dest1 = tmp_dir.join("resp1.json");
        let dest2 = tmp_dir.join("resp2.bin");
        let dest3 = tmp_dir.join("resp3.json");

        // UTF-8
        let r1 = save_to_path(
            dest1.to_str().unwrap(),
            Some(r#"{"status":"ok"}"#),
            Some("utf8"),
            None,
        );
        assert!(r1.is_ok());
        assert_eq!(
            std::fs::read_to_string(&dest1).unwrap(),
            r#"{"status":"ok"}"#
        );

        // Base64
        let b64 = "aGVsbG8gd29ybGQ="; // "hello world"
        let r2 = save_to_path(dest2.to_str().unwrap(), Some(b64), Some("base64"), None);
        assert!(r2.is_ok());
        assert_eq!(std::fs::read_to_string(&dest2).unwrap(), "hello world");

        // Copy from source file
        let r3 = save_to_path(
            dest3.to_str().unwrap(),
            None,
            None,
            Some(dest1.to_str().unwrap()),
        );
        assert!(r3.is_ok());
        assert_eq!(
            std::fs::read_to_string(&dest3).unwrap(),
            r#"{"status":"ok"}"#
        );

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
