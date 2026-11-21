//! SQLite-backed local storage (rusqlite). Rust owns the connection, so the
//! frontend never runs SQL — it only calls the typed store commands
//! (ARCHITECTURE.md §1–2). Direct rusqlite use needs no Tauri plugin and no
//! capability grant, exactly like `std::fs`.
//!
//! Tables:
//!   settings(key, value)   — user-settings key/value store (incl. collections_path)
//!   documents(name, data)  — opaque frontend-owned JSON blobs (environments)
//!   history(id, at, data)  — the send log; tabular so it stays queryable
//!
//! Collections are deliberately **not** in the DB. They live as a JSON file at a
//! user-defined path (`settings['collections_path']`) so they can be Git-tracked
//! and shared between users (ARCHITECTURE.md §8). The DB only stores the path.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::models::{Cookie, Workspace};
use crate::store;

const DB_FILE: &str = "restio.db";
const COLLECTIONS_PATH_KEY: &str = "collections_path";
const ACTIVE_ENV_KEY: &str = "active_env_id";
const ACTIVE_WS_KEY: &str = "active_workspace_id";

fn storage<E: std::fmt::Display>(e: E) -> AppError {
    AppError::Storage(e.to_string())
}

/// Managed SQLite handle. `rusqlite::Connection` isn't `Sync`, so it lives
/// behind a `Mutex` and is reached via `tauri::State<Db>`.
pub struct Db(Mutex<Connection>);

impl Db {
    /// Open (creating if needed) the app database, run migrations, and import
    /// any pre-existing JSON store files on first run.
    pub fn new(app: &AppHandle) -> Result<Self, AppError> {
        let dir = app.path().app_data_dir().map_err(storage)?;
        std::fs::create_dir_all(&dir).map_err(storage)?;
        let target_db = dir.join(DB_FILE);
        if !target_db.exists() {
            for legacy in &["api-man.db", "ag-api-man.db"] {
                let legacy_path = dir.join(legacy);
                if legacy_path.exists() {
                    let _ = std::fs::copy(&legacy_path, &target_db);
                    break;
                }
            }
        }
        let conn = Connection::open(target_db).map_err(storage)?;
        init_schema(&conn)?;
        let db = Db(Mutex::new(conn));
        db.migrate_from_json(app)?;
        db.ensure_default_collections_path(app)?;
        db.ensure_default_workspace(app)?;
        Ok(db)
    }

    // ── settings ────────────────────────────────────────────────────────────

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(storage(other)),
        })
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO settings(key, value) VALUES(?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(storage)?;
        Ok(())
    }

    /// All settings as a JSON object (`{ key: value, … }`).
    pub fn all_settings(&self) -> Result<Value, AppError> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT key, value FROM settings")
            .map_err(storage)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(storage)?;
        let mut map = serde_json::Map::new();
        for row in rows {
            let (k, v) = row.map_err(storage)?;
            map.insert(k, Value::String(v));
        }
        Ok(Value::Object(map))
    }

    /// Upsert every key of a settings object. Values are coerced to strings
    /// (the settings store is textual); non-string values are JSON-encoded.
    pub fn save_settings(&self, settings: &Value) -> Result<(), AppError> {
        let Some(obj) = settings.as_object() else {
            return Err(AppError::Storage("settings must be a JSON object".into()));
        };
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(storage)?;
        for (k, v) in obj {
            let s = match v {
                Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            tx.execute(
                "INSERT INTO settings(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![k, s],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)?;
        Ok(())
    }

    // ── opaque documents (environments) ──────────────────────────────────────

    /// Load an opaque JSON document by name, or `Value::Null` if absent.
    pub fn load_document(&self, name: &str) -> Result<Value, AppError> {
        let conn = self.0.lock().unwrap();
        let raw: Option<String> = conn
            .query_row(
                "SELECT data FROM documents WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(storage(other)),
            })?;
        match raw {
            Some(s) => serde_json::from_str(&s).map_err(storage),
            None => Ok(Value::Null),
        }
    }

    pub fn save_document(&self, name: &str, value: &Value) -> Result<(), AppError> {
        let data = serde_json::to_string(value).map_err(storage)?;
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO documents(name, data) VALUES(?1, ?2)
             ON CONFLICT(name) DO UPDATE SET data = excluded.data",
            params![name, data],
        )
        .map_err(storage)?;
        Ok(())
    }

    pub fn delete_document(&self, name: &str) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM documents WHERE name = ?1", params![name])
            .map_err(storage)?;
        Ok(())
    }

    // ── environments (opaque doc, scoped to the active workspace) ────────────

    /// Document name for the active workspace's environments.
    fn env_doc_name(&self) -> Result<String, AppError> {
        Ok(match self.active_workspace_id()? {
            Some(id) => format!("environments:{id}"),
            None => "environments".to_string(),
        })
    }

    pub fn load_environments(&self) -> Result<Value, AppError> {
        let name = self.env_doc_name()?;
        self.load_document(&name)
    }

    pub fn save_environments(&self, value: &Value) -> Result<(), AppError> {
        let name = self.env_doc_name()?;
        self.save_document(&name, value)
    }

    // ── history (tabular) ────────────────────────────────────────────────────

    /// Load the send log as a JSON array, newest first.
    pub fn load_history(&self) -> Result<Value, AppError> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT data FROM history ORDER BY at DESC, rowid DESC")
            .map_err(storage)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(storage)?;
        let mut out = Vec::new();
        for row in rows {
            let s = row.map_err(storage)?;
            out.push(serde_json::from_str::<Value>(&s).map_err(storage)?);
        }
        Ok(Value::Array(out))
    }

    /// Replace the entire send log with `history` (a JSON array of entries).
    /// The frontend already bounds the list, so a full replace keeps the DB in
    /// lockstep with the in-memory log without needing per-entry diffing.
    pub fn save_history(&self, history: &Value) -> Result<(), AppError> {
        let Some(entries) = history.as_array() else {
            return Err(AppError::Storage("history must be a JSON array".into()));
        };
        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(storage)?;
        tx.execute("DELETE FROM history", []).map_err(storage)?;
        for entry in entries {
            let id = entry.get("id").and_then(Value::as_str).unwrap_or_default();
            let at = entry.get("at").and_then(Value::as_i64).unwrap_or(0);
            let data = serde_json::to_string(entry).map_err(storage)?;
            tx.execute(
                "INSERT INTO history(id, at, data) VALUES(?1, ?2, ?3)",
                params![id, at, data],
            )
            .map_err(storage)?;
        }
        tx.commit().map_err(storage)?;
        Ok(())
    }

    /// Append a single history entry and prune old records past `max_entries`.
    pub fn append_history_entry(&self, entry: &Value, max_entries: usize) -> Result<(), AppError> {
        let id = entry.get("id").and_then(Value::as_str).unwrap_or_default();
        let at = entry.get("at").and_then(Value::as_i64).unwrap_or(0);
        let data = serde_json::to_string(entry).map_err(storage)?;

        let mut conn = self.0.lock().unwrap();
        let tx = conn.transaction().map_err(storage)?;
        tx.execute(
            "INSERT INTO history(id, at, data) VALUES(?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET at = excluded.at, data = excluded.data",
            params![id, at, data],
        )
        .map_err(storage)?;

        // Prune older history exceeding max_entries
        tx.execute(
            "DELETE FROM history WHERE id NOT IN (
                SELECT id FROM history ORDER BY at DESC, rowid DESC LIMIT ?1
            )",
            params![max_entries as i64],
        )
        .map_err(storage)?;

        tx.commit().map_err(storage)?;
        Ok(())
    }

    /// Delete a single history entry by id.
    pub fn delete_history_entry(&self, id: &str) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM history WHERE id = ?1", params![id])
            .map_err(storage)?;
        Ok(())
    }

    /// Clear all history entries.
    pub fn clear_history(&self) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM history", []).map_err(storage)?;
        Ok(())
    }

    // ── collections path ─────────────────────────────────────────────────────

    /// The file path where the active workspace's collections live. Defaults to
    /// the legacy setting / `app_data_dir()/collections.json` before any
    /// workspace exists.
    pub fn collections_path(&self, app: &AppHandle) -> Result<PathBuf, AppError> {
        if let Some(ws) = self.active_workspace()? {
            if !ws.collections_path.is_empty() {
                return Ok(PathBuf::from(ws.collections_path));
            }
        }
        if let Some(p) = self.get_setting(COLLECTIONS_PATH_KEY)? {
            return Ok(PathBuf::from(p));
        }
        default_collections_path(app)
    }

    /// Point the active workspace's collections at a new path (used by Git
    /// init/clone). Falls back to the legacy setting if no workspace yet.
    pub fn set_collections_path(&self, path: &str) -> Result<(), AppError> {
        if let Some(id) = self.active_workspace_id()? {
            let conn = self.0.lock().unwrap();
            conn.execute(
                "UPDATE workspaces SET collections_path = ?2 WHERE id = ?1",
                params![id, path],
            )
            .map_err(storage)?;
            Ok(())
        } else {
            self.set_setting(COLLECTIONS_PATH_KEY, path)
        }
    }

    fn ensure_default_collections_path(&self, app: &AppHandle) -> Result<(), AppError> {
        if self.get_setting(COLLECTIONS_PATH_KEY)?.is_none() {
            let default = default_collections_path(app)?;
            self.set_setting(COLLECTIONS_PATH_KEY, &default.to_string_lossy())?;
        }
        Ok(())
    }

    // ── workspaces ───────────────────────────────────────────────────────────

    pub fn list_workspaces(&self) -> Result<Vec<Workspace>, AppError> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, name, collections_path, active_env_id FROM workspaces ORDER BY rowid",
            )
            .map_err(storage)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Workspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    collections_path: r.get(2)?,
                    active_env_id: r.get(3)?,
                })
            })
            .map_err(storage)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(storage)?);
        }
        Ok(out)
    }

    pub fn active_workspace_id(&self) -> Result<Option<String>, AppError> {
        self.get_setting(ACTIVE_WS_KEY)
    }

    fn workspace_by_id(&self, id: &str) -> Result<Option<Workspace>, AppError> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, name, collections_path, active_env_id FROM workspaces WHERE id = ?1",
            params![id],
            |r| {
                Ok(Workspace {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    collections_path: r.get(2)?,
                    active_env_id: r.get(3)?,
                })
            },
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(storage(other)),
        })
    }

    pub fn active_workspace(&self) -> Result<Option<Workspace>, AppError> {
        match self.active_workspace_id()? {
            Some(id) => self.workspace_by_id(&id),
            None => Ok(None),
        }
    }

    pub fn create_workspace(
        &self,
        id: &str,
        name: &str,
        collections_path: &str,
    ) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO workspaces(id, name, collections_path, active_env_id)
             VALUES(?1, ?2, ?3, '')",
            params![id, name, collections_path],
        )
        .map_err(storage)?;
        Ok(())
    }

    pub fn switch_workspace(&self, id: &str) -> Result<(), AppError> {
        self.set_setting(ACTIVE_WS_KEY, id)
    }

    pub fn rename_workspace(&self, id: &str, name: &str) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET name = ?2 WHERE id = ?1",
            params![id, name],
        )
        .map_err(storage)?;
        Ok(())
    }

    /// Remove a workspace and its environments. If it was active, switch to the
    /// first remaining workspace.
    pub fn delete_workspace(&self, id: &str) -> Result<(), AppError> {
        {
            let conn = self.0.lock().unwrap();
            conn.execute("DELETE FROM workspaces WHERE id = ?1", params![id])
                .map_err(storage)?;
        }
        self.delete_document(&format!("environments:{id}"))?;
        if self.active_workspace_id()?.as_deref() == Some(id) {
            if let Some(first) = self.list_workspaces()?.into_iter().next() {
                self.switch_workspace(&first.id)?;
            }
        }
        Ok(())
    }

    /// Set the active environment on the active workspace.
    pub fn set_active_env(&self, env_id: &str) -> Result<(), AppError> {
        let id = self
            .active_workspace_id()?
            .ok_or_else(|| AppError::Storage("no active workspace".into()))?;
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE workspaces SET active_env_id = ?2 WHERE id = ?1",
            params![id, env_id],
        )
        .map_err(storage)?;
        Ok(())
    }

    // ── cookies (scoped per workspace) ───────────────────────────────────────

    fn row_to_cookie(row: &rusqlite::Row) -> Result<Cookie, rusqlite::Error> {
        Ok(Cookie {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            domain: row.get(2)?,
            path: row.get(3)?,
            name: row.get(4)?,
            value: row.get(5)?,
            http_only: row.get::<_, i64>(6)? != 0,
            secure: row.get::<_, i64>(7)? != 0,
            same_site: row.get(8)?,
            expires: row.get(9)?,
            max_age: row.get(10)?,
            created_at: row.get(11)?,
        })
    }

    /// List all cookies stored for a workspace, optionally filtered by domain.
    pub fn list_cookies(
        &self,
        workspace_id: &str,
        domain: Option<&str>,
    ) -> Result<Vec<Cookie>, AppError> {
        let conn = self.0.lock().unwrap();
        let query = if domain.is_some() {
            "SELECT id, workspace_id, domain, path, name, value, http_only, secure, same_site, expires, max_age, created_at
             FROM cookies WHERE workspace_id = ?1 AND domain = ?2 ORDER BY domain, path, name"
        } else {
            "SELECT id, workspace_id, domain, path, name, value, http_only, secure, same_site, expires, max_age, created_at
             FROM cookies WHERE workspace_id = ?1 ORDER BY domain, path, name"
        };
        let mut stmt = conn.prepare(query).map_err(storage)?;
        let rows = if let Some(d) = domain {
            stmt.query_map(params![workspace_id, d], Self::row_to_cookie)
        } else {
            stmt.query_map(params![workspace_id], Self::row_to_cookie)
        }
        .map_err(storage)?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(storage)?);
        }
        Ok(out)
    }

    /// Upsert a cookie for a workspace. Replaces value, flags, and expiration
    /// if (workspace_id, domain, path, name) matches.
    pub fn upsert_cookie(&self, cookie: &Cookie) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO cookies(id, workspace_id, domain, path, name, value, http_only, secure, same_site, expires, max_age, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(workspace_id, domain, path, name) DO UPDATE SET
                value = excluded.value,
                http_only = excluded.http_only,
                secure = excluded.secure,
                same_site = excluded.same_site,
                expires = excluded.expires,
                max_age = excluded.max_age,
                created_at = excluded.created_at",
            params![
                cookie.id,
                cookie.workspace_id,
                cookie.domain,
                cookie.path,
                cookie.name,
                cookie.value,
                cookie.http_only as i64,
                cookie.secure as i64,
                cookie.same_site,
                cookie.expires,
                cookie.max_age,
                cookie.created_at,
            ],
        )
        .map_err(storage)?;
        Ok(())
    }

    /// Delete a single cookie by (workspace_id, domain, path, name).
    pub fn delete_cookie(
        &self,
        workspace_id: &str,
        domain: &str,
        path: &str,
        name: &str,
    ) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "DELETE FROM cookies WHERE workspace_id = ?1 AND domain = ?2 AND path = ?3 AND name = ?4",
            params![workspace_id, domain, path, name],
        )
        .map_err(storage)?;
        Ok(())
    }

    /// Delete a single cookie by ID.
    pub fn delete_cookie_by_id(&self, id: &str) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM cookies WHERE id = ?1", params![id])
            .map_err(storage)?;
        Ok(())
    }

    /// Clear all cookies for a workspace, optionally restricted to a specific domain.
    pub fn clear_cookies(&self, workspace_id: &str, domain: Option<&str>) -> Result<(), AppError> {
        let conn = self.0.lock().unwrap();
        if let Some(d) = domain {
            conn.execute(
                "DELETE FROM cookies WHERE workspace_id = ?1 AND domain = ?2",
                params![workspace_id, d],
            )
        } else {
            conn.execute(
                "DELETE FROM cookies WHERE workspace_id = ?1",
                params![workspace_id],
            )
        }
        .map_err(storage)?;
        Ok(())
    }

    /// Retrieve all unexpired cookies matching the given request host, path, and security.
    pub fn get_cookies_for_request(
        &self,
        workspace_id: &str,
        host: &str,
        path: &str,
        is_secure: bool,
    ) -> Result<Vec<Cookie>, AppError> {
        let candidates = crate::http::cookies::candidate_domains(host);
        if candidates.is_empty() {
            return Ok(Vec::new());
        }

        let now = crate::http::cookies::now_sec();
        let conn = self.0.lock().unwrap();

        let placeholders = (0..candidates.len())
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT id, workspace_id, domain, path, name, value, http_only, secure, same_site, expires, max_age, created_at
             FROM cookies
             WHERE workspace_id = ? AND (expires IS NULL OR expires >= ?) AND domain IN ({placeholders})
             ORDER BY path DESC, created_at ASC"
        );

        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> =
            Vec::with_capacity(candidates.len() + 2);
        param_values.push(Box::new(workspace_id.to_string()));
        param_values.push(Box::new(now));
        for c in &candidates {
            param_values.push(Box::new(c.clone()));
        }

        let mut stmt = conn.prepare(&sql).map_err(storage)?;
        let rows = stmt
            .query_map(
                rusqlite::params_from_iter(param_values.iter()),
                Self::row_to_cookie,
            )
            .map_err(storage)?;

        let mut matched = Vec::new();
        for r in rows {
            let cookie = r.map_err(storage)?;
            if crate::http::cookies::matches_request(&cookie, host, path, is_secure, now) {
                matched.push(cookie);
            }
        }

        Ok(matched)
    }

    /// Bootstrap a first workspace from any pre-workspace data, so there is
    /// always exactly one to fall back to. Idempotent.
    fn ensure_default_workspace(&self, app: &AppHandle) -> Result<(), AppError> {
        if !self.list_workspaces()?.is_empty() {
            return Ok(());
        }
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let id = format!("ws-{nanos}");
        let cp = self.get_setting(COLLECTIONS_PATH_KEY)?.unwrap_or_else(|| {
            default_collections_path(app)
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned()
        });
        self.create_workspace(&id, "My Workspace", &cp)?;
        // Carry over the legacy active-env and global environments doc.
        if let Some(env) = self.get_setting(ACTIVE_ENV_KEY)? {
            let conn = self.0.lock().unwrap();
            conn.execute(
                "UPDATE workspaces SET active_env_id = ?2 WHERE id = ?1",
                params![id, env],
            )
            .map_err(storage)?;
        }
        let existing_envs = self.load_document("environments")?;
        if !existing_envs.is_null() {
            self.save_document(&format!("environments:{id}"), &existing_envs)?;
        }
        self.switch_workspace(&id)?;
        Ok(())
    }

    // ── one-time migration from the legacy JSON files ────────────────────────

    /// Import pre-SQLite JSON store files (history.json, environments.json) into
    /// the DB on first run. Idempotent: guarded so it never double-imports, and
    /// the old files are left in place as a manual backup.
    fn migrate_from_json(&self, app: &AppHandle) -> Result<(), AppError> {
        let dir = app.path().app_data_dir().map_err(storage)?;

        // History → history table (only if the table is still empty).
        let empty: i64 = {
            let conn = self.0.lock().unwrap();
            conn.query_row("SELECT COUNT(*) FROM history", [], |r| r.get(0))
                .map_err(storage)?
        };
        if empty == 0 {
            let path = dir.join("history.json");
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    if value.is_array() {
                        self.save_history(&value)?;
                    }
                }
            }
        }

        // Environments → documents['environments'] (only if not already present).
        if matches!(self.load_document("environments")?, Value::Null) {
            let path = dir.join("environments.json");
            if let Ok(text) = std::fs::read_to_string(&path) {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    if !value.is_null() {
                        self.save_document("environments", &value)?;
                    }
                }
            }
        }

        Ok(())
    }
}

fn default_collections_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().app_data_dir().map_err(storage)?;
    Ok(dir.join(store::COLLECTIONS_FILE))
}

fn init_schema(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;
         CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS documents (
            name TEXT PRIMARY KEY,
            data TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS history (
            id   TEXT PRIMARY KEY,
            at   INTEGER NOT NULL,
            data TEXT NOT NULL
         );
         CREATE INDEX IF NOT EXISTS history_at ON history(at DESC);
         CREATE TABLE IF NOT EXISTS workspaces (
            id               TEXT PRIMARY KEY,
            name             TEXT NOT NULL,
            collections_path TEXT NOT NULL,
            active_env_id    TEXT NOT NULL DEFAULT ''
         );
         CREATE TABLE IF NOT EXISTS cookies (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            domain       TEXT NOT NULL,
            path         TEXT NOT NULL DEFAULT '/',
            name         TEXT NOT NULL,
            value        TEXT NOT NULL,
            http_only    INTEGER NOT NULL DEFAULT 0,
            secure       INTEGER NOT NULL DEFAULT 0,
            same_site    TEXT NOT NULL DEFAULT '',
            expires      INTEGER,
            max_age      INTEGER,
            created_at   INTEGER NOT NULL
         );
         CREATE INDEX IF NOT EXISTS cookies_ws_domain ON cookies(workspace_id, domain);
         CREATE UNIQUE INDEX IF NOT EXISTS cookies_unique ON cookies(workspace_id, domain, path, name);",
    )
    .map_err(storage)
}

#[cfg(test)]
impl Db {
    /// In-memory DB for tests — schema only, no AppHandle / migration.
    fn open_in_memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        Db(Mutex::new(conn))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn environments_are_scoped_per_workspace() {
        let db = Db::open_in_memory();
        db.create_workspace("a", "A", "/tmp/a/collections.json")
            .unwrap();
        db.create_workspace("b", "B", "/tmp/b/collections.json")
            .unwrap();

        // Workspace A gets its own environments + active env.
        db.switch_workspace("a").unwrap();
        db.save_environments(&json!([{ "id": "e1" }])).unwrap();
        db.set_active_env("e1").unwrap();

        // Workspace B starts empty and can't see A's environments.
        db.switch_workspace("b").unwrap();
        assert!(db.load_environments().unwrap().is_null());
        db.save_environments(&json!([{ "id": "e2" }])).unwrap();

        // Back in A: its data is intact and isolated from B.
        db.switch_workspace("a").unwrap();
        assert_eq!(db.load_environments().unwrap(), json!([{ "id": "e1" }]));
        assert_eq!(db.active_workspace().unwrap().unwrap().active_env_id, "e1");

        // Deleting A removes its environments and switches active to B.
        db.delete_workspace("a").unwrap();
        assert_eq!(db.active_workspace_id().unwrap().as_deref(), Some("b"));
        assert!(db.load_document("environments:a").unwrap().is_null());
        assert_eq!(db.load_environments().unwrap(), json!([{ "id": "e2" }]));
    }

    #[test]
    fn history_append_prune_delete_and_clear() {
        let db = Db::open_in_memory();

        // 1. Append entries
        let e1 = json!({ "id": "h1", "at": 1000, "status": 200 });
        let e2 = json!({ "id": "h2", "at": 2000, "status": 404 });
        let e3 = json!({ "id": "h3", "at": 3000, "status": 500 });

        db.append_history_entry(&e1, 10).unwrap();
        db.append_history_entry(&e2, 10).unwrap();
        db.append_history_entry(&e3, 10).unwrap();

        let hist = db.load_history().unwrap();
        let arr = hist.as_array().expect("history should be array");
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["id"], "h3"); // newest first
        assert_eq!(arr[1]["id"], "h2");
        assert_eq!(arr[2]["id"], "h1");

        // 2. Prune on append (limit = 2)
        let e4 = json!({ "id": "h4", "at": 4000, "status": 200 });
        db.append_history_entry(&e4, 2).unwrap();
        let hist = db.load_history().unwrap();
        let arr = hist.as_array().unwrap();
        assert_eq!(arr.len(), 2);
        assert_eq!(arr[0]["id"], "h4");
        assert_eq!(arr[1]["id"], "h3");

        // 3. Delete single entry
        db.delete_history_entry("h4").unwrap();
        let hist = db.load_history().unwrap();
        let arr = hist.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["id"], "h3");

        // 4. Clear all history
        db.clear_history().unwrap();
        let hist = db.load_history().unwrap();
        let arr = hist.as_array().unwrap();
        assert_eq!(arr.len(), 0);
    }

    #[test]
    fn cookie_crud_and_matching() {
        let db = Db::open_in_memory();
        let c1 = Cookie {
            id: "c1".into(),
            workspace_id: "ws-a".into(),
            domain: "api.example.com".into(),
            path: "/v1".into(),
            name: "auth_token".into(),
            value: "xyz123".into(),
            http_only: true,
            secure: true,
            same_site: "Strict".into(),
            expires: None,
            max_age: None,
            created_at: 1000,
        };
        let c2 = Cookie {
            id: "c2".into(),
            workspace_id: "ws-a".into(),
            domain: "example.com".into(),
            path: "/".into(),
            name: "theme".into(),
            value: "dark".into(),
            http_only: false,
            secure: false,
            same_site: "Lax".into(),
            expires: None,
            max_age: None,
            created_at: 1000,
        };

        // 1. Insert cookies
        db.upsert_cookie(&c1).unwrap();
        db.upsert_cookie(&c2).unwrap();

        // 2. List all in ws-a
        let cookies = db.list_cookies("ws-a", None).unwrap();
        assert_eq!(cookies.len(), 2);

        // 3. Filter by domain
        let example_cookies = db.list_cookies("ws-a", Some("example.com")).unwrap();
        assert_eq!(example_cookies.len(), 1);
        assert_eq!(example_cookies[0].name, "theme");

        // 4. Match request
        let matched = db
            .get_cookies_for_request("ws-a", "api.example.com", "/v1/users", true)
            .unwrap();
        assert_eq!(matched.len(), 2); // both match

        // 5. Update cookie value on conflict
        let mut c1_updated = c1.clone();
        c1_updated.value = "new_token_456".into();
        db.upsert_cookie(&c1_updated).unwrap();
        let cookies_after = db.list_cookies("ws-a", Some("api.example.com")).unwrap();
        assert_eq!(cookies_after.len(), 1);
        assert_eq!(cookies_after[0].value, "new_token_456");

        // 6. Delete cookie by id
        db.delete_cookie_by_id(&c1.id).unwrap();
        let cookies_after_delete = db.list_cookies("ws-a", None).unwrap();
        assert_eq!(cookies_after_delete.len(), 1);
        assert_eq!(cookies_after_delete[0].name, "theme");

        // 7. Clear all cookies
        db.clear_cookies("ws-a", None).unwrap();
        assert_eq!(db.list_cookies("ws-a", None).unwrap().len(), 0);
    }
}
