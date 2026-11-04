use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalPosition, Manager, WebviewWindow,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MARGIN: f64 = 24.0;

fn focus_main(app: &AppHandle) -> Option<WebviewWindow> {
    let w = app.get_webview_window("main")?;
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
    Some(w)
}

#[tauri::command]
fn show_system_window(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let win = app.get_webview_window("system").ok_or("system window missing")?;
    if let Some(monitor) = win.primary_monitor().map_err(|e| e.to_string())? {
        let scale = monitor.scale_factor();
        let mpos = monitor.position().to_logical::<f64>(scale);
        let msize = monitor.size().to_logical::<f64>(scale);
        let wsize = win.outer_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
        let x = mpos.x + msize.width - wsize.width - MARGIN;
        let y = mpos.y + MARGIN;
        win.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    }
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

    tauri::Builder::default()
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
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        focus_main(app);
                        let _ = app.emit("levels://toggle-status", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![show_system_window, hide_system_window])
        .setup(move |app| {
            // CmdOrCtrl+Shift+S: Cmd on macOS, Ctrl elsewhere.
            let sc = if cfg!(target_os = "macos") { toggle } else { toggle_alt };
            if let Err(e) = app.global_shortcut().register(sc) {
                eprintln!("failed to register global shortcut: {e}");
            }

            let open = MenuItem::with_id(app, "open_status", "Open Status Window", true, None::<&str>)?;
            let daily = MenuItem::with_id(app, "show_daily", "Show Daily Quest", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &daily, &quit])?;

            let mut tray = TrayIconBuilder::new().menu(&menu).tooltip("Levels");
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
                "quit" => app.exit(0),
                _ => {}
            })
            .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Levels");
}
