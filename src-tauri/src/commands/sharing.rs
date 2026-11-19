//! Git-based collection sharing commands (ARCHITECTURE.md §8). Thin adapters
//! over `crate::sync`. The "repo" is the directory containing the collections
//! file; the collections file itself is the only thing committed.

use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::error::AppError;
use crate::store;
use crate::store::db::Db;
use crate::sync::{self, GitStatus, PullResult};

const COLLECTIONS_IN_REPO: &str = "collections.json";

/// The repo working directory = the folder holding the collections file.
fn repo_dir(app: &tauri::AppHandle, db: &Db) -> Result<PathBuf, AppError> {
    let cp = db.collections_path(app)?;
    Ok(cp.parent().map(Path::to_path_buf).unwrap_or(cp))
}

/// The collections file's name within its repo (for staging).
fn collections_file_name(app: &tauri::AppHandle, db: &Db) -> Result<String, AppError> {
    let cp = db.collections_path(app)?;
    Ok(cp
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| COLLECTIONS_IN_REPO.to_string()))
}

/// Git state of the current collections repo (for the sharing UI).
#[tauri::command]
pub fn sharing_status(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<GitStatus, AppError> {
    Ok(sync::status(&repo_dir(&app, &db)?))
}

/// A sensible default directory to create/clone a shared collections repo into.
#[tauri::command]
pub fn sharing_default_dir(app: tauri::AppHandle) -> Result<String, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Storage(e.to_string()))?;
    Ok(dir.join("collections-repo").to_string_lossy().into_owned())
}

/// Turn `dir` into a fresh Git repo seeded with the current collections, and
/// repoint storage at it. Ready for a remote + push.
#[tauri::command]
pub fn sharing_init(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    dir: String,
) -> Result<GitStatus, AppError> {
    let target = PathBuf::from(&dir);
    sync::init(&target)?;

    // Copy the current collections into the new repo and repoint storage there.
    let current = db.collections_path(&app)?;
    let data = store::read_json(&current)?;
    let seed = if data.is_null() {
        serde_json::json!([])
    } else {
        data
    };
    let dest = target.join(COLLECTIONS_IN_REPO);
    store::write_json_atomic(&dest, &seed)?;
    db.set_collections_path(&dest.to_string_lossy())?;

    sync::stage_commit(&target, COLLECTIONS_IN_REPO, "Initial collections")?;
    Ok(sync::status(&target))
}

/// Clone `url` into `dir` and point storage at its collections file. The
/// frontend reloads collections afterward.
#[tauri::command]
pub fn sharing_clone(
    db: tauri::State<'_, Db>,
    url: String,
    dir: String,
) -> Result<GitStatus, AppError> {
    let target = PathBuf::from(&dir);
    sync::clone(&url, &target)?;
    let dest = target.join(COLLECTIONS_IN_REPO);
    db.set_collections_path(&dest.to_string_lossy())?;
    Ok(sync::status(&target))
}

/// Set (or update) the `origin` remote of the current repo.
#[tauri::command]
pub fn sharing_set_remote(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    url: String,
) -> Result<GitStatus, AppError> {
    let dir = repo_dir(&app, &db)?;
    sync::set_remote(&dir, &url)?;
    Ok(sync::status(&dir))
}

/// Commit the current collections and push to `origin` (if a remote exists).
#[tauri::command]
pub fn sharing_publish(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    message: String,
) -> Result<GitStatus, AppError> {
    let dir = repo_dir(&app, &db)?;
    let file = collections_file_name(&app, &db)?;
    let msg = if message.trim().is_empty() {
        "Update collections".to_string()
    } else {
        message
    };
    sync::stage_commit(&dir, &file, &msg)?;
    sync::push(&dir)?;
    Ok(sync::status(&dir))
}

/// Pull the latest collections. Any pending local edits are committed first (so
/// nothing is lost and divergence is measured in commits); the result tells the
/// frontend whether it fast-forwarded, was already current, or diverged and
/// needs the user to pick a resolution (see `sharing_resolve_pull`). The
/// frontend reloads collections when the working file changed.
#[tauri::command]
pub fn sharing_pull(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
) -> Result<PullResult, AppError> {
    let dir = repo_dir(&app, &db)?;
    let file = collections_file_name(&app, &db)?;
    sync::stage_commit(&dir, &file, "Local collection changes")?;
    sync::pull(&dir)
}

/// Resolve a diverged pull at the file level: `"remote"` discards local commits
/// and takes the remote verbatim; `"local"` keeps the local collections and
/// records the remote as merged so the next publish fast-forwards. Any other
/// value is rejected. The frontend reloads collections afterward.
#[tauri::command]
pub fn sharing_resolve_pull(
    app: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    strategy: String,
) -> Result<GitStatus, AppError> {
    let dir = repo_dir(&app, &db)?;
    match strategy.as_str() {
        "remote" => sync::use_remote(&dir)?,
        "local" => sync::keep_local(&dir)?,
        other => return Err(AppError::Git(format!("unknown resolve strategy: {other}"))),
    }
    Ok(sync::status(&dir))
}
