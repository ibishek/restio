//! WebSocket models for IPC communication.

use serde::{Deserialize, Serialize};

/// Outbound message sent from frontend to Rust.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsOutboundMessage {
    /// `"text"`, `"binary"`, `"ping"`
    pub kind: String,
    /// Text payload or base64 encoded binary payload
    pub data: String,
}

/// Events emitted from Rust WebSocket manager to frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "type")]
pub enum WsEvent {
    Connected {
        connection_id: String,
        url: String,
        timestamp_ms: i64,
    },
    Message {
        connection_id: String,
        /// `"in"` or `"out"`
        direction: String,
        /// `"text"` or `"binary"`
        kind: String,
        data: String,
        size_bytes: usize,
        timestamp_ms: i64,
    },
    Ping {
        connection_id: String,
        /// `"in"` or `"out"`
        direction: String,
        timestamp_ms: i64,
    },
    Pong {
        connection_id: String,
        /// `"in"` or `"out"`
        direction: String,
        latency_ms: Option<u64>,
        timestamp_ms: i64,
    },
    Closed {
        connection_id: String,
        code: Option<u16>,
        reason: Option<String>,
        clean: bool,
        timestamp_ms: i64,
    },
    Error {
        connection_id: String,
        message: String,
        timestamp_ms: i64,
    },
}
