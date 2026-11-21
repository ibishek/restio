//! Cookie storage IPC commands.

use crate::error::AppError;
use crate::models::Cookie;
use crate::store::db::Db;

/// List all stored cookies for the active workspace, optionally filtered by domain.
#[tauri::command]
pub fn get_cookies(
    db: tauri::State<'_, Db>,
    domain: Option<String>,
) -> Result<Vec<Cookie>, AppError> {
    let ws_id = db
        .active_workspace_id()?
        .unwrap_or_else(|| "default".to_string());
    db.list_cookies(&ws_id, domain.as_deref())
}

/// Create or update a cookie in the active workspace.
#[tauri::command]
pub fn save_cookie(db: tauri::State<'_, Db>, cookie: Cookie) -> Result<(), AppError> {
    db.upsert_cookie(&cookie)
}

/// Delete a cookie by its unique ID.
#[tauri::command]
pub fn delete_cookie(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    db.delete_cookie_by_id(&id)
}

/// Clear cookies for the active workspace (optionally limited to a specific domain).
#[tauri::command]
pub fn clear_cookies(db: tauri::State<'_, Db>, domain: Option<String>) -> Result<(), AppError> {
    let ws_id = db
        .active_workspace_id()?
        .unwrap_or_else(|| "default".to_string());
    db.clear_cookies(&ws_id, domain.as_deref())
}
