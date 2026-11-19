//! System-tray icon + menu.
//!
//! The window's close (X) button hides to the tray (see the `on_window_event`
//! handler in `lib.rs`) rather than quitting, so the app keeps running in the
//! background with its in-memory tabs intact. The tray is the way back:
//! left-click toggles the window (macOS/Windows), and the menu offers
//! Show / Hide / Quit on every platform — Linux tray backends only surface the
//! menu, not click events, so Quit lives there too.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager,
};

/// Show, un-minimize and focus the main window.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Toggle the main window between visible+focused and hidden.
fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

/// Build the tray icon + menu once, from the setup hook.
pub fn create(app: &App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray_show", "Show RestIO", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "tray_hide", "Hide", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray_quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &separator, &quit])?;

    let Some(icon) = app.default_window_icon() else {
        return Ok(());
    };

    TrayIconBuilder::with_id("main")
        .icon(icon.clone())
        .tooltip("RestIO")
        .menu(&menu)
        // Left-click toggles the window; the menu opens on right-click. (On Linux
        // the tray backend shows the menu on any click and emits no click event.)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray_show" => show_main_window(app),
            "tray_hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "tray_quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
