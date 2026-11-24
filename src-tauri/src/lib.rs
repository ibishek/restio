mod commands;
mod error;
mod http;
mod models;
mod state;
mod store;
mod sync;
mod tray;
mod ws;

use std::sync::Arc;

use commands::cookies::{clear_cookies, delete_cookie, get_cookies, save_cookie};
use commands::requests::{cancel_request, send_request};
use commands::sharing::{
    sharing_clone, sharing_default_dir, sharing_init, sharing_publish, sharing_pull,
    sharing_resolve_pull, sharing_set_remote, sharing_status,
};
use commands::store::{
    append_history_entry, clear_history, delete_history_entry, get_collections_path,
    load_collections, load_environments, load_history, load_settings, save_collections,
    save_environments, save_history, save_response_body, save_response_to_file, save_settings,
    set_collections_path,
};
use commands::websocket::{ws_connect, ws_disconnect, ws_send};
use commands::workspace::{
    active_workspace, create_workspace, delete_workspace, list_workspaces, rename_workspace,
    set_active_env, switch_workspace, workspace_members,
};
use state::RequestRegistry;
use store::db::Db;
use tauri::Manager;
use ws::WsConnectionRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(RequestRegistry::default())
        .manage(Arc::new(WsConnectionRegistry::default()))
        .setup(|app| {
            // Open the SQLite store (and run first-run JSON migration) once the
            // app handle exists, then hand it to managed state.
            let db = Db::new(app.handle())?;
            app.manage(db);
            // System-tray icon + menu (see tray.rs). Pairs with the close-to-tray
            // window handler below.
            tray::create(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // The close (X) button hides to the tray instead of quitting, keeping
            // the app (and its in-memory tabs) alive in the background. The only
            // real quit is the tray menu's Quit item (app.exit).
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            send_request,
            cancel_request,
            load_collections,
            save_collections,
            get_collections_path,
            set_collections_path,
            load_environments,
            save_environments,
            load_history,
            save_history,
            append_history_entry,
            delete_history_entry,
            clear_history,
            load_settings,
            save_settings,
            save_response_body,
            save_response_to_file,
            sharing_status,
            sharing_default_dir,
            sharing_init,
            sharing_clone,
            sharing_set_remote,
            sharing_publish,
            sharing_pull,
            sharing_resolve_pull,
            list_workspaces,
            active_workspace,
            create_workspace,
            switch_workspace,
            rename_workspace,
            delete_workspace,
            set_active_env,
            workspace_members,
            get_cookies,
            save_cookie,
            delete_cookie,
            clear_cookies,
            ws_connect,
            ws_send,
            ws_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
