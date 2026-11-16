//! Localhost tool API for the MCP server / automation (see src/agent/contract.ts).
//!
//!   GET  /v1/health          → { ok:true, app:"levels", version }       (no auth)
//!   GET  /v1/tools           → ToolDef[] (as last registered by the webview)
//!   POST /v1/tools/{name}    → ToolResult (bridged to the main window; 15 s → 504)
//!
//! Bound strictly to 127.0.0.1. Every route except /v1/health needs `Authorization: Bearer <token>`,
//! where the token lives in `<app_data_dir>/mcp-token` (0600). The bound port goes to `mcp-port`.

use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path as UrlPath, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;

pub const DEFAULT_PORT: u16 = 41414;
const PORT_ATTEMPTS: u16 = 21; // 41414 plus the next 20
const TOOL_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BODY: usize = 64 * 1024;
pub const TOOL_REQUEST_EVENT: &str = "levels://tool-request";

/// Shared between the Tauri commands and the HTTP handlers.
#[derive(Default)]
pub struct ApiState {
    tools: Mutex<Vec<Value>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    info: Mutex<Option<LocalApiInfo>>,
    seq: AtomicU64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApiInfo {
    pub port: u16,
    pub token_path: String,
}

impl ApiState {
    pub fn set_tools(&self, tools: Vec<Value>) {
        *self.tools.lock().unwrap() = tools;
    }

    /// Complete a pending request; returns false if it already timed out / is unknown.
    pub fn complete(&self, id: &str, result: Value) -> bool {
        match self.pending.lock().unwrap().remove(id) {
            Some(tx) => tx.send(result).is_ok(),
            None => false,
        }
    }

    pub fn info(&self) -> Option<LocalApiInfo> {
        self.info.lock().unwrap().clone()
    }

    fn has_tool(&self, name: &str) -> bool {
        self.tools
            .lock()
            .unwrap()
            .iter()
            .any(|t| t.get("name").and_then(Value::as_str) == Some(name))
    }
}

#[derive(Clone)]
struct Ctx {
    app: AppHandle,
    token: String,
}

/// Start the API on Tauri's async runtime. Errors are logged (never the token) and the app keeps running.
pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(e) = serve(app).await {
            eprintln!("[levels] local API disabled: {e}");
        }
    });
}

async fn serve(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let token_path = dir.join("mcp-token");
    let token = load_or_create_token(&token_path)?;

    let mut bound = None;
    for port in DEFAULT_PORT..DEFAULT_PORT + PORT_ATTEMPTS {
        if let Ok(l) = tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            bound = Some((l, port));
            break;
        }
    }
    let (listener, port) = bound.ok_or_else(|| {
        format!("no free port in {DEFAULT_PORT}..{}", DEFAULT_PORT + PORT_ATTEMPTS - 1)
    })?;
    write_private(&dir.join("mcp-port"), port.to_string().as_bytes())?;
    *app.state::<ApiState>().info.lock().unwrap() = Some(LocalApiInfo {
        port,
        token_path: token_path.display().to_string(),
    });
    eprintln!("[levels] local API listening on 127.0.0.1:{port}");

    let router = Router::new()
        .route("/v1/health", get(health))
        .route("/v1/tools", get(list_tools))
        .route("/v1/tools/{name}", post(call_tool))
        .layer(DefaultBodyLimit::max(MAX_BODY))
        .with_state(Ctx { app, token });
    axum::serve(listener, router).await.map_err(|e| e.to_string())
}

fn load_or_create_token(path: &Path) -> Result<String, String> {
    if let Ok(s) = std::fs::read_to_string(path) {
        let t = s.trim();
        if t.len() >= 32 && t.chars().all(|c| c.is_ascii_hexdigit()) {
            ensure_private(path);
            return Ok(t.to_string());
        }
    }
    let bytes: [u8; 32] = rand::random();
    let token: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    write_private(path, token.as_bytes())?;
    Ok(token)
}

fn write_private(path: &Path, data: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| format!("write {}: {e}", path.display()))?;
        f.write_all(data).map_err(|e| format!("write {}: {e}", path.display()))?;
    }
    #[cfg(not(unix))]
    std::fs::write(path, data).map_err(|e| format!("write {}: {e}", path.display()))?;
    ensure_private(path);
    Ok(())
}

fn ensure_private(_path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(_path, std::fs::Permissions::from_mode(0o600));
    }
}

fn err(status: StatusCode, msg: &str) -> Response {
    (status, Json(json!({ "ok": false, "content": "", "error": msg }))).into_response()
}

fn authorized(ctx: &Ctx, headers: &HeaderMap) -> bool {
    let Some(given) = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    else {
        return false;
    };
    // Constant-time comparison.
    let (a, b) = (given.trim().as_bytes(), ctx.token.as_bytes());
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "app": "levels", "version": env!("CARGO_PKG_VERSION") }))
}

async fn list_tools(State(ctx): State<Ctx>, headers: HeaderMap) -> Response {
    if !authorized(&ctx, &headers) {
        return err(StatusCode::UNAUTHORIZED, "missing or invalid token");
    }
    let tools = ctx.app.state::<ApiState>().tools.lock().unwrap().clone();
    Json(Value::Array(tools)).into_response()
}

async fn call_tool(
    State(ctx): State<Ctx>,
    UrlPath(name): UrlPath<String>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !authorized(&ctx, &headers) {
        return err(StatusCode::UNAUTHORIZED, "missing or invalid token");
    }
    let state = ctx.app.state::<ApiState>();
    if !state.has_tool(&name) {
        return err(StatusCode::NOT_FOUND, &format!("unknown tool: {name}"));
    }

    // Body is the args object itself; `{ "args": {...} }` is also accepted. Empty body → {}.
    let args = if body.iter().all(|b| b.is_ascii_whitespace()) {
        json!({})
    } else {
        match serde_json::from_slice::<Value>(&body) {
            Ok(Value::Object(mut m)) => match m.remove("args") {
                Some(inner @ Value::Object(_)) if m.is_empty() => inner,
                Some(other) => {
                    m.insert("args".into(), other);
                    Value::Object(m)
                }
                None => Value::Object(m),
            },
            Ok(_) => return err(StatusCode::BAD_REQUEST, "body must be a JSON object"),
            Err(e) => return err(StatusCode::BAD_REQUEST, &format!("invalid JSON: {e}")),
        }
    };

    let id = format!("api-{}-{}", std::process::id(), state.seq.fetch_add(1, Ordering::Relaxed));
    let (tx, rx) = oneshot::channel();
    state.pending.lock().unwrap().insert(id.clone(), tx);

    let payload = json!({ "id": id, "name": name, "args": args, "source": "mcp" });
    let sent = match ctx.app.get_webview_window("main") {
        Some(_) => ctx.app.emit_to("main", TOOL_REQUEST_EVENT, payload).map_err(|e| e.to_string()),
        None => Err("main window missing".to_string()),
    };
    if let Err(e) = sent {
        state.pending.lock().unwrap().remove(&id);
        return err(StatusCode::SERVICE_UNAVAILABLE, &format!("app not ready: {e}"));
    }

    match tokio::time::timeout(TOOL_TIMEOUT, rx).await {
        Ok(Ok(result)) => Json(result).into_response(),
        _ => {
            state.pending.lock().unwrap().remove(&id);
            err(StatusCode::GATEWAY_TIMEOUT, "app did not respond")
        }
    }
}
