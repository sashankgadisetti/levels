use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MARGIN: f64 = 24.0;

fn focus_main(app: &AppHandle) -> Option<WebviewWindow> {
    let w = app.get_webview_window("main")?;
    set_policy(app, true);
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
    Some(w)
}

/// Switch the macOS activation policy: Accessory (no Dock icon) while the main
/// window is hidden in the tray, Regular while it is visible.
#[cfg(target_os = "macos")]
fn set_policy(app: &AppHandle, visible: bool) {
    let _ = app.set_activation_policy(if visible {
        tauri::ActivationPolicy::Regular
    } else {
        tauri::ActivationPolicy::Accessory
    });
}
#[cfg(not(target_os = "macos"))]
fn set_policy(_app: &AppHandle, _visible: bool) {}

fn hide_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
    set_policy(app, false);
}

fn toggle_main(app: &AppHandle) {
    let visible = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false);
    if visible {
        hide_main(app);
    } else {
        focus_main(app);
    }
}

#[tauri::command]
fn open_main(app: AppHandle, screen: Option<String>) -> Result<(), String> {
    focus_main(&app).ok_or("main window missing")?;
    app.emit("levels://open-screen", screen).map_err(|e| e.to_string())
}

/// Pin the system window to the top-right of the monitor under the cursor (else the primary, else the first).
fn anchor_top_right(win: &WebviewWindow, size: Option<LogicalSize<f64>>) -> Result<(), String> {
    let monitor = win
        .cursor_position()
        .ok()
        .and_then(|p| win.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| win.primary_monitor().ok().flatten())
        .or_else(|| win.available_monitors().ok().and_then(|m| m.into_iter().next()));
    if let Some(monitor) = monitor {
        let scale = monitor.scale_factor();
        let mpos = monitor.position().to_logical::<f64>(scale);
        let msize = monitor.size().to_logical::<f64>(scale);
        let wsize = match size {
            Some(s) => s,
            None => win.outer_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale),
        };
        let x = mpos.x + msize.width - wsize.width - MARGIN;
        let y = mpos.y + MARGIN;
        win.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resize the system window to its rendered content and re-anchor it in one step (called by the popup page).
#[tauri::command]
fn fit_system_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let win = app.get_webview_window("system").ok_or("system window missing")?;
    let size = LogicalSize::new(width.clamp(360.0, 560.0), height.clamp(160.0, 780.0));
    win.set_size(size).map_err(|e| e.to_string())?;
    anchor_top_right(&win, Some(size))
}

#[tauri::command]
fn show_system_window(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let win = app.get_webview_window("system").ok_or("system window missing")?;
    anchor_top_right(&win, None)?;
    let _ = win.set_always_on_top(true);
    // Show without focusing so we never steal focus from the user's current app.
    win.show().map_err(|e| e.to_string())?;
    win.emit("levels://system-window", payload).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_system_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("system") {
        win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let toggle = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyS);
    let toggle_alt = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyS);

    let quick_log = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyL);
    let quick_log_alt = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);

    let builder = tauri::Builder::default();
    // A second launch focuses the existing instance instead of starting another.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        focus_main(app);
    }));
    // TODO(updater): add tauri-plugin-updater once release signing keys exist (see SETUP.md).
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        focus_main(app);
                        if shortcut.key == Code::KeyL {
                            let _ = app.emit("levels://quick-log", ());
                        } else {
                            let _ = app.emit("levels://toggle-status", ());
                        }
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            // Closing the main window hides it to the tray; "Quit" in the tray menu exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    hide_main(window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![show_system_window, hide_system_window, fit_system_window, open_main])
        .setup(move |app| {
            // CmdOrCtrl+Shift+S: Cmd on macOS, Ctrl elsewhere.
            let sc = if cfg!(target_os = "macos") { toggle } else { toggle_alt };
            let ql = if cfg!(target_os = "macos") { quick_log } else { quick_log_alt };
            for s in [sc, ql] {
                if let Err(e) = app.global_shortcut().register(s) {
                    eprintln!("failed to register global shortcut: {e}");
                }
            }

            let open = MenuItem::with_id(app, "open_status", "Open Levels", true, None::<&str>)?;
            let daily = MenuItem::with_id(app, "show_daily", "Show Daily Quest", true, None::<&str>)?;
            let sys = MenuItem::with_id(app, "show_system", "Show System Window", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &daily, &sys, &sep, &quit])?;

            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("Levels — System").show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "open_status" => {
                    focus_main(app);
                    let _ = app.emit("levels://open-status", ());
                }
                "show_daily" => {
                    focus_main(app);
                    let _ = app.emit("levels://show-daily-quest", ());
                }
                "show_system" => {
                    // The frontend builds the status spec and calls show_system_window.
                    let _ = app.emit("levels://toggle-status", ());
                }
                "quit" => app.exit(0),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    toggle_main(tray.app_handle());
                }
            })
            .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Levels");
}
