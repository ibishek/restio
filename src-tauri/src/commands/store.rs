use serde_json::Value;

use crate::error::AppError;
use crate::store;
use crate::store::db::Db;

// ── Collections (JSON file at a user-defined, Git-shareable path) ────────────

#[tauri::command]
pub fn load_collections(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<Value, AppError> {
    let path = db.collections_path(&app)?;
    store::read_json(&path)
}

#[tauri::command]
pub fn save_collections(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    collections: Value,
) -> Result<(), AppError> {
    let path = db.collections_path(&app)?;
    store::write_json_atomic(&path, &collections)
}

/// The file path where collections are stored (settings-backed; defaults to
/// `app_data_dir()/collections.json`).
#[tauri::command]
pub fn get_collections_path(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<String, AppError> {
    Ok(db.collections_path(&app)?.to_string_lossy().into_owned())
}

/// Point collections at a new path (e.g. a Git working copy). Does not move the
/// existing file — the frontend re-saves after switching.
#[tauri::command]
pub fn set_collections_path(db: tauri::State<'_, Db>, path: String) -> Result<(), AppError> {
    db.set_collections_path(&path)
}

// ── Environments (opaque blob in SQLite; local, never shared) ────────────────

#[tauri::command]
pub fn load_environments(db: tauri::State<'_, Db>) -> Result<Value, AppError> {
    db.load_environments()
}

#[tauri::command]
pub fn save_environments(db: tauri::State<'_, Db>, environments: Value) -> Result<(), AppError> {
    db.save_environments(&environments)
}

// ── History (tabular in SQLite; local, never shared) ─────────────────────────

#[tauri::command]
pub fn load_history(db: tauri::State<'_, Db>) -> Result<Value, AppError> {
    db.load_history()
}

#[tauri::command]
pub fn save_history(db: tauri::State<'_, Db>, history: Value) -> Result<(), AppError> {
    db.save_history(&history)
}

#[tauri::command]
pub fn append_history_entry(db: tauri::State<'_, Db>, entry: Value) -> Result<(), AppError> {
    db.append_history_entry(&entry, 200)
}

#[tauri::command]
pub fn delete_history_entry(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    db.delete_history_entry(&id)
}

#[tauri::command]
pub fn clear_history(db: tauri::State<'_, Db>) -> Result<(), AppError> {
    db.clear_history()
}

// ── User settings (key/value in SQLite) ──────────────────────────────────────

#[tauri::command]
pub fn load_settings(db: tauri::State<'_, Db>) -> Result<Value, AppError> {
    db.all_settings()
}

#[tauri::command]
pub fn save_settings(db: tauri::State<'_, Db>, settings: Value) -> Result<(), AppError> {
    db.save_settings(&settings)
}

// ── Response downloads (unchanged — large-body files) ─────────────────────────

/// Save a (typically large) response body to disk and return the file path.
#[tauri::command]
pub fn save_response_body(
    app: tauri::AppHandle,
    body: String,
    encoding: String,
    content_type: String,
) -> Result<String, AppError> {
    store::save_download(&app, &body, &encoding, &content_type)
}

/// Save a response body or copy an offloaded response file to a specific destination path.
#[tauri::command]
pub fn save_response_to_file(
    dest_path: String,
    body: Option<String>,
    encoding: Option<String>,
    source_file: Option<String>,
) -> Result<String, AppError> {
    store::save_to_path(
        &dest_path,
        body.as_deref(),
        encoding.as_deref(),
        source_file.as_deref(),
    )
}
