//! Shared application state held via `.manage()` (ARCHITECTURE.md §6).

use std::collections::HashMap;
use std::sync::Mutex;

use tokio::task::AbortHandle;

/// Tracks in-flight requests by run-id so they can be cancelled. The guard is
/// never held across an `.await`, so a std `Mutex` is fine.
#[derive(Default)]
pub struct RequestRegistry(Mutex<HashMap<String, AbortHandle>>);

impl RequestRegistry {
    pub fn insert(&self, run_id: String, handle: AbortHandle) {
        self.0.lock().unwrap().insert(run_id, handle);
    }

    pub fn remove(&self, run_id: &str) {
        self.0.lock().unwrap().remove(run_id);
    }

    /// Abort the request with this run-id, if it is still running.
    pub fn abort(&self, run_id: &str) {
        if let Some(handle) = self.0.lock().unwrap().remove(run_id) {
            handle.abort();
        }
    }
}
