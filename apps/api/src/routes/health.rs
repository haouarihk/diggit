use axum::{Json, extract::State};
use serde_json::{Value, json};

use crate::state::AppState;

pub(crate) async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "server": state.config.host(),
        "webUrl": state.config.public_web_url,
        "sshHost": state.config.ssh_host,
        "sshPort": state.config.ssh_port,
    }))
}
