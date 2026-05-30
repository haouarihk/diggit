use std::{env, path::PathBuf};

use axum::{Json, http::HeaderMap};
use base64::{Engine as _, engine::general_purpose};
use chrono::{Duration, Utc};
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use regex::Regex;
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use tokio::{fs, process::Command};
use tracing::warn;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{ApiError, ApiResult},
    models::*,
    state::AppState,
};

pub(crate) mod auth;
pub(crate) mod federation;
pub(crate) mod git;
pub(crate) mod orgs;
pub(crate) mod repos;
pub(crate) mod runners;
pub(crate) mod search;
pub(crate) mod ssh;
pub(crate) mod utils;

pub(crate) use auth::*;
pub(crate) use federation::*;
pub(crate) use git::*;
pub(crate) use orgs::*;
pub(crate) use repos::*;
pub(crate) use runners::*;
pub(crate) use search::*;
pub(crate) use ssh::*;
pub(crate) use utils::*;
