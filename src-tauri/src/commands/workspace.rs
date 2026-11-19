//! Workspace commands (CLAUDE.md domain model). A workspace scopes a set of
//! collections + environments; its members are the Git contributors of the
//! shared collections repo. Thin adapters over `crate::store::db` + `crate::sync`.

use std::path::{Path, PathBuf};

use serde_json::json;
use tauri::Manager;

use crate::error::AppError;
use crate::models::{Member, Workspace};
use crate::store;
use crate::store::db::Db;
use crate::sync;

#[tauri::command]
pub fn list_workspaces(db: tauri::State<'_, Db>) -> Result<Vec<Workspace>, AppError> {
    db.list_workspaces()
}

#[tauri::command]
pub fn active_workspace(db: tauri::State<'_, Db>) -> Result<Option<Workspace>, AppError> {
    db.active_workspace()
}

/// Create a workspace with its own (empty) collections file under the app data
/// dir, and switch to it. The frontend supplies the id (like other entities).
#[tauri::command]
pub fn create_workspace(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
) -> Result<Workspace, AppError> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    let path = base.join("workspaces").join(&id).join("collections.json");
    store::write_json_atomic(&path, &json!([]))?;
    db.create_workspace(&id, &name, &path.to_string_lossy())?;
    db.switch_workspace(&id)?;
    db.active_workspace()?
        .ok_or_else(|| AppError::Storage("workspace vanished after create".into()))
}

#[tauri::command]
pub fn switch_workspace(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    db.switch_workspace(&id)
}

#[tauri::command]
pub fn rename_workspace(
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
) -> Result<(), AppError> {
    db.rename_workspace(&id, &name)
}

#[tauri::command]
pub fn delete_workspace(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    db.delete_workspace(&id)
}

/// Set the active environment on the active workspace.
#[tauri::command]
pub fn set_active_env(db: tauri::State<'_, Db>, env_id: String) -> Result<(), AppError> {
    db.set_active_env(&env_id)
}

/// Members of the active workspace = Git contributors of its collections repo.
#[tauri::command]
pub fn workspace_members(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<Vec<Member>, AppError> {
    let cp = db.collections_path(&app)?;
    let dir: PathBuf = cp.parent().map(Path::to_path_buf).unwrap_or(cp);
    Ok(sync::members(&dir))
}
