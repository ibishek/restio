use tauri::Manager;

use crate::error::AppError;
use crate::http::executor;
use crate::models::{HttpRequest, HttpResponse};
use crate::state::RequestRegistry;

/// Send the request the user composed and return the captured response.
///
/// The request runs as an abortable task keyed by `run_id`, so a concurrent
/// `cancel_request(run_id)` can stop it mid-flight (ARCHITECTURE.md §1).
#[tauri::command]
pub async fn send_request(
    app: tauri::AppHandle,
    run_id: String,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let app_clone = app.clone();
    let task = tokio::spawn(async move { executor::execute(req, Some(&app_clone)).await });
    app.state::<RequestRegistry>()
        .insert(run_id.clone(), task.abort_handle());

    let joined = task.await;
    app.state::<RequestRegistry>().remove(&run_id);

    match joined {
        Ok(result) => result,
        Err(e) if e.is_cancelled() => Err(AppError::Cancelled),
        Err(e) => Err(AppError::Request(e.to_string())),
    }
}

/// Abort an in-flight request by its run-id. No-op if it already finished.
#[tauri::command]
pub fn cancel_request(app: tauri::AppHandle, run_id: String) {
    app.state::<RequestRegistry>().abort(&run_id);
}
