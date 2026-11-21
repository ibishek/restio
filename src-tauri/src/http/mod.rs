//! The HTTP engine. All outbound requests run here, in Rust — never in the
//! webview — so there is no CORS wall and any header can be set
//! (ARCHITECTURE.md §1).

pub mod auth;
pub mod cookies;
pub mod executor;
