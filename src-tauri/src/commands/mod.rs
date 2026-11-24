//! `#[tauri::command]` adapters. These stay thin — deserialize, delegate to a
//! service, map the result (ARCHITECTURE.md §6).

pub mod cookies;
pub mod requests;
pub mod sharing;
pub mod store;
pub mod websocket;
pub mod workspace;
