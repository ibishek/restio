//! WebSocket client engine for managing live bi-directional connections.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use tauri::ipc::Channel;
use tokio::sync::mpsc;
use tokio::task::AbortHandle;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::{HeaderName, HeaderValue};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::frame::CloseFrame;
use tokio_tungstenite::tungstenite::protocol::Message;

use crate::models::{KeyValue, WsEvent};

fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Commands sent from the IPC handlers to an active WebSocket connection task.
#[derive(Debug)]
pub enum WsOutboundCommand {
    SendText(String),
    SendBinary(Vec<u8>),
    Ping,
    Disconnect {
        code: Option<u16>,
        reason: Option<String>,
    },
}

/// Handle held in application state to send messages or terminate a connection.
pub struct WsHandle {
    pub tx: mpsc::Sender<WsOutboundCommand>,
    pub abort_handle: AbortHandle,
}

/// Thread-safe registry of all active WebSocket connections keyed by `connection_id`.
#[derive(Default)]
pub struct WsConnectionRegistry {
    connections: Mutex<HashMap<String, WsHandle>>,
}

impl WsConnectionRegistry {
    pub fn insert(&self, id: String, handle: WsHandle) {
        if let Ok(mut map) = self.connections.lock() {
            if let Some(old) = map.insert(id, handle) {
                old.abort_handle.abort();
            }
        }
    }

    pub fn remove(&self, id: &str) -> Option<WsHandle> {
        self.connections.lock().ok()?.remove(id)
    }

    pub fn send_command(&self, id: &str, cmd: WsOutboundCommand) -> Result<(), String> {
        let guard = self
            .connections
            .lock()
            .map_err(|e| format!("Lock error: {e}"))?;
        if let Some(handle) = guard.get(id) {
            handle
                .tx
                .try_send(cmd)
                .map_err(|e| format!("Failed to queue WebSocket message: {e}"))
        } else {
            Err("WebSocket connection not found or closed".into())
        }
    }

    pub fn abort(&self, id: &str) {
        if let Ok(mut map) = self.connections.lock() {
            if let Some(handle) = map.remove(id) {
                handle.abort_handle.abort();
            }
        }
    }
}

/// Normalize input URL for WebSockets:
/// converts `http://` -> `ws://` and `https://` -> `wss://`, or prepends `ws://`.
pub fn normalize_ws_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.starts_with("https://") {
        format!("wss://{}", &trimmed["https://".len()..])
    } else if trimmed.starts_with("http://") {
        format!("ws://{}", &trimmed["http://".len()..])
    } else if trimmed.starts_with("wss://") || trimmed.starts_with("ws://") {
        trimmed.to_string()
    } else {
        format!("ws://{trimmed}")
    }
}

/// Connect to a WebSocket endpoint, spawn the event pump, and register the connection.
pub async fn connect(
    connection_id: String,
    raw_url: String,
    headers: Vec<KeyValue>,
    danger_accept_invalid_certs: bool,
    registry: Arc<WsConnectionRegistry>,
    channel: Channel<WsEvent>,
) -> Result<(), String> {
    let ws_url = normalize_ws_url(&raw_url);

    let mut request = ws_url
        .clone()
        .into_client_request()
        .map_err(|e| format!("Invalid WebSocket URL '{ws_url}': {e}"))?;

    for h in headers {
        if h.enabled && !h.key.trim().is_empty() {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(h.key.trim().as_bytes()),
                HeaderValue::from_str(h.value.trim()),
            ) {
                request.headers_mut().insert(name, val);
            }
        }
    }

    // Attempt connection
    let (ws_stream, _response) = if danger_accept_invalid_certs && ws_url.starts_with("wss://") {
        connect_dangerously(request).await?
    } else {
        tokio_tungstenite::connect_async(request)
            .await
            .map_err(|e| format!("WebSocket connection failed: {e}"))?
    };

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let (tx, mut rx) = mpsc::channel::<WsOutboundCommand>(128);

    // Notify connected
    let _ = channel.send(WsEvent::Connected {
        connection_id: connection_id.clone(),
        url: ws_url.clone(),
        timestamp_ms: current_timestamp_ms(),
    });

    let conn_id_clone = connection_id.clone();
    let registry_clone = registry.clone();
    let channel_clone = channel.clone();

    let task = tokio::spawn(async move {
        let mut last_ping: Option<Instant> = None;

        loop {
            tokio::select! {
                // Inbound messages from server
                inbound = ws_stream.next() => {
                    match inbound {
                        Some(Ok(Message::Text(text))) => {
                            let size = text.len();
                            let _ = channel_clone.send(WsEvent::Message {
                                connection_id: conn_id_clone.clone(),
                                direction: "in".to_string(),
                                kind: "text".to_string(),
                                data: text,
                                size_bytes: size,
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(Ok(Message::Binary(bytes))) => {
                            let size = bytes.len();
                            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                            let _ = channel_clone.send(WsEvent::Message {
                                connection_id: conn_id_clone.clone(),
                                direction: "in".to_string(),
                                kind: "binary".to_string(),
                                data: encoded,
                                size_bytes: size,
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(Ok(Message::Ping(_))) => {
                            let _ = channel_clone.send(WsEvent::Ping {
                                connection_id: conn_id_clone.clone(),
                                direction: "in".to_string(),
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(Ok(Message::Pong(_))) => {
                            let latency = last_ping.take().map(|start| start.elapsed().as_millis() as u64);
                            let _ = channel_clone.send(WsEvent::Pong {
                                connection_id: conn_id_clone.clone(),
                                direction: "in".to_string(),
                                latency_ms: latency,
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(Ok(Message::Close(frame))) => {
                            let code = frame.as_ref().map(|f| u16::from(f.code));
                            let reason = frame.as_ref().map(|f| f.reason.to_string());
                            let _ = channel_clone.send(WsEvent::Closed {
                                connection_id: conn_id_clone.clone(),
                                code,
                                reason,
                                clean: true,
                                timestamp_ms: current_timestamp_ms(),
                            });
                            break;
                        }
                        Some(Ok(Message::Frame(_))) => {}
                        Some(Err(e)) => {
                            let _ = channel_clone.send(WsEvent::Error {
                                connection_id: conn_id_clone.clone(),
                                message: e.to_string(),
                                timestamp_ms: current_timestamp_ms(),
                            });
                            let _ = channel_clone.send(WsEvent::Closed {
                                connection_id: conn_id_clone.clone(),
                                code: None,
                                reason: Some(e.to_string()),
                                clean: false,
                                timestamp_ms: current_timestamp_ms(),
                            });
                            break;
                        }
                        None => {
                            // Stream closed
                            let _ = channel_clone.send(WsEvent::Closed {
                                connection_id: conn_id_clone.clone(),
                                code: None,
                                reason: None,
                                clean: true,
                                timestamp_ms: current_timestamp_ms(),
                            });
                            break;
                        }
                    }
                }

                // Outbound messages from frontend
                outbound = rx.recv() => {
                    match outbound {
                        Some(WsOutboundCommand::SendText(text)) => {
                            let size = text.len();
                            let msg_data = text.clone();
                            if let Err(e) = ws_sink.send(Message::Text(text)).await {
                                let _ = channel_clone.send(WsEvent::Error {
                                    connection_id: conn_id_clone.clone(),
                                    message: format!("Failed to send text message: {e}"),
                                    timestamp_ms: current_timestamp_ms(),
                                });
                                break;
                            }
                            let _ = channel_clone.send(WsEvent::Message {
                                connection_id: conn_id_clone.clone(),
                                direction: "out".to_string(),
                                kind: "text".to_string(),
                                data: msg_data,
                                size_bytes: size,
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(WsOutboundCommand::SendBinary(bytes)) => {
                            let size = bytes.len();
                            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
                            if let Err(e) = ws_sink.send(Message::Binary(bytes)).await {
                                let _ = channel_clone.send(WsEvent::Error {
                                    connection_id: conn_id_clone.clone(),
                                    message: format!("Failed to send binary message: {e}"),
                                    timestamp_ms: current_timestamp_ms(),
                                });
                                break;
                            }
                            let _ = channel_clone.send(WsEvent::Message {
                                connection_id: conn_id_clone.clone(),
                                direction: "out".to_string(),
                                kind: "binary".to_string(),
                                data: encoded,
                                size_bytes: size,
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(WsOutboundCommand::Ping) => {
                            last_ping = Some(Instant::now());
                            if let Err(e) = ws_sink.send(Message::Ping(vec![].into())).await {
                                let _ = channel_clone.send(WsEvent::Error {
                                    connection_id: conn_id_clone.clone(),
                                    message: format!("Failed to send ping: {e}"),
                                    timestamp_ms: current_timestamp_ms(),
                                });
                                break;
                            }
                            let _ = channel_clone.send(WsEvent::Ping {
                                connection_id: conn_id_clone.clone(),
                                direction: "out".to_string(),
                                timestamp_ms: current_timestamp_ms(),
                            });
                        }
                        Some(WsOutboundCommand::Disconnect { code, reason }) => {
                            let close_frame = code.map(|c| CloseFrame {
                                code: CloseCode::from(c),
                                reason: reason.unwrap_or_default().into(),
                            });
                            let _ = ws_sink.send(Message::Close(close_frame)).await;
                            let _ = channel_clone.send(WsEvent::Closed {
                                connection_id: conn_id_clone.clone(),
                                code,
                                reason: None,
                                clean: true,
                                timestamp_ms: current_timestamp_ms(),
                            });
                            break;
                        }
                        None => {
                            // Channel closed
                            break;
                        }
                    }
                }
            }
        }

        registry_clone.remove(&conn_id_clone);
    });

    registry.insert(
        connection_id,
        WsHandle {
            tx,
            abort_handle: task.abort_handle(),
        },
    );

    Ok(())
}

/// Fallback connector when certificate verification is disabled.
async fn connect_dangerously(
    request: tokio_tungstenite::tungstenite::handshake::client::Request,
) -> Result<
    (
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        tokio_tungstenite::tungstenite::handshake::client::Response,
    ),
    String,
> {
    // For now use default connector; if invalid certs, tungstenite returns handshake error
    tokio_tungstenite::connect_async(request)
        .await
        .map_err(|e| format!("WebSocket TLS connection failed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_ws_url() {
        assert_eq!(
            normalize_ws_url("http://localhost:8080"),
            "ws://localhost:8080"
        );
        assert_eq!(
            normalize_ws_url("https://echo.websocket.org"),
            "wss://echo.websocket.org"
        );
        assert_eq!(
            normalize_ws_url("ws://localhost:3000"),
            "ws://localhost:3000"
        );
        assert_eq!(
            normalize_ws_url("wss://gateway.io/feed"),
            "wss://gateway.io/feed"
        );
        assert_eq!(
            normalize_ws_url("api.example.com/stream"),
            "ws://api.example.com/stream"
        );
    }

    #[test]
    fn test_ws_event_serialization() {
        let msg = WsEvent::Message {
            connection_id: "conn-1".to_string(),
            direction: "in".to_string(),
            kind: "text".to_string(),
            data: "hello".to_string(),
            size_bytes: 5,
            timestamp_ms: 1000,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"connectionId\":\"conn-1\""), "JSON was: {}", json);
        assert!(json.contains("\"sizeBytes\":5"), "JSON was: {}", json);
        assert!(json.contains("\"timestampMs\":1000"), "JSON was: {}", json);

        let pong = WsEvent::Pong {
            connection_id: "conn-2".to_string(),
            direction: "in".to_string(),
            latency_ms: Some(42),
            timestamp_ms: 2000,
        };
        let pong_json = serde_json::to_string(&pong).unwrap();
        assert!(pong_json.contains("\"latencyMs\":42"), "JSON was: {}", pong_json);
        assert!(pong_json.contains("\"connectionId\":\"conn-2\""), "JSON was: {}", pong_json);
    }
}
