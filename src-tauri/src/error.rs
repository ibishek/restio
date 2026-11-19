//! Application error type. Implements `Serialize` so it crosses the IPC
//! boundary as a plain string the frontend can display (ARCHITECTURE.md §6).

use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid URL: {0}")]
    InvalidUrl(String),
    #[error("Unsupported HTTP method: {0}")]
    InvalidMethod(String),
    #[error("Invalid header \"{0}\"")]
    InvalidHeader(String),
    #[error("{0}")]
    Request(String),
    #[error("Request cancelled")]
    Cancelled,
    #[error("Storage error: {0}")]
    Storage(String),
    #[error("Could not read file \"{0}\": {1}")]
    FileRead(String, String),
    #[error("{0}")]
    Git(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
