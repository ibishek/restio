use std::sync::Arc;

use base64::Engine;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::models::{KeyValue, WsEvent, WsOutboundMessage};
use crate::ws::{connect, WsConnectionRegistry, WsOutboundCommand};

#[tauri::command]
pub async fn ws_connect(
    app: AppHandle,
    connection_id: String,
    url: String,
    headers: Vec<KeyValue>,
    danger_accept_invalid_certs: bool,
    on_event: Channel<WsEvent>,
) -> Result<(), AppError> {
    let registry = app.state::<Arc<WsConnectionRegistry>>().inner().clone();

    connect(
        connection_id,
        url,
        headers,
        danger_accept_invalid_certs,
        registry,
        on_event,
    )
    .await
    .map_err(AppError::Request)
}

#[tauri::command]
pub fn ws_send(
    app: AppHandle,
    connection_id: String,
    message: WsOutboundMessage,
) -> Result<(), AppError> {
    let registry = app.state::<Arc<WsConnectionRegistry>>();

    let cmd = match message.kind.as_str() {
        "text" => WsOutboundCommand::SendText(message.data),
        "binary" => {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(message.data.trim())
                .map_err(|e| AppError::Request(format!("Invalid base64 payload: {e}")))?;
            WsOutboundCommand::SendBinary(bytes)
        }
        "ping" => WsOutboundCommand::Ping,
        other => {
            return Err(AppError::Request(format!(
                "Unsupported WebSocket message kind: {other}"
            )))
        }
    };

    registry
        .send_command(&connection_id, cmd)
        .map_err(AppError::Request)
}

#[tauri::command]
pub fn ws_disconnect(
    app: AppHandle,
    connection_id: String,
    code: Option<u16>,
    reason: Option<String>,
) -> Result<(), AppError> {
    let registry = app.state::<Arc<WsConnectionRegistry>>();

    // Send disconnect command
    if registry
        .send_command(
            &connection_id,
            WsOutboundCommand::Disconnect { code, reason },
        )
        .is_err()
    {
        // If sending command fails or connection already terminating, abort handle directly
        registry.abort(&connection_id);
    }

    Ok(())
}
