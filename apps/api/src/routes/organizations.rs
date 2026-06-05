use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    error::{ApiError, ApiResult},
    models::*,
    services::*,
    state::AppState,
};

pub(crate) async fn create_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateOrganizationRequest>,
) -> ApiResult<Json<Organization>> {
    let auth = require_auth(&state, &headers)?;
    let name = normalize_name(&input.name)?;
    ensure_claimable_owner_name(&name)?;
    ensure_namespace_available(&state.pool, &name).await?;

    let organization = sqlx::query_as::<_, Organization>(
        r#"
        INSERT INTO organizations (id, name, display_name, description, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(&name)
    .bind(input.display_name.unwrap_or_else(|| name.clone()))
    .bind(input.description.unwrap_or_default())
    .bind(auth.id)
    .fetch_one(&state.pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO namespaces (id, name, kind, organization_id)
        VALUES ($1, $2, 'organization', $3)
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(&organization.name)
    .bind(organization.id)
    .execute(&state.pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES ($1, $2, 'owner')
        "#,
    )
    .bind(organization.id)
    .bind(auth.id)
    .execute(&state.pool)
    .await?;

    Ok(Json(organization))
}

pub(crate) async fn list_organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organizations = sqlx::query_as::<_, Organization>(
        r#"
        SELECT organizations.*
        FROM organizations
        JOIN organization_members ON organization_members.organization_id = organizations.id
        WHERE organization_members.user_id = $1
        ORDER BY organizations.name ASC
        "#,
    )
    .bind(auth.id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(json!({ "data": organizations })))
}

pub(crate) async fn get_organization(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<Json<Organization>> {
    let name = normalize_name(&name)?;
    let organization =
        sqlx::query_as::<_, Organization>("SELECT * FROM organizations WHERE name = $1")
            .bind(name)
            .fetch_one(&state.pool)
            .await?;
    Ok(Json(organization))
}

pub(crate) async fn delete_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let name = normalize_name(&name)?;
    let organization = get_organization_by_name(&state.pool, &name).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;

    let repo_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM repositories WHERE owner_handle = $1")
            .bind(&name)
            .fetch_one(&state.pool)
            .await?;

    if repo_count > 0 {
        return Err(ApiError::Conflict(
            "organization cannot be deleted while it owns repositories".to_string(),
        ));
    }

    sqlx::query("DELETE FROM organizations WHERE id = $1")
        .bind(organization.id)
        .execute(&state.pool)
        .await?;

    Ok(Json(json!({ "status": "deleted" })))
}

pub(crate) async fn update_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(input): Json<UpdateOrganizationRequest>,
) -> ApiResult<Json<Organization>> {
    let auth = require_auth(&state, &headers)?;
    let name = normalize_name(&name)?;
    let organization = get_organization_by_name(&state.pool, &name).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;

    let display_name = input
        .display_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or(organization.display_name);
    let description = input.description.unwrap_or(organization.description);

    let organization = sqlx::query_as::<_, Organization>(
        r#"
        UPDATE organizations
        SET display_name = $2,
            description = $3,
            updated_at = now()
        WHERE id = $1
        RETURNING *
        "#,
    )
    .bind(organization.id)
    .bind(display_name)
    .bind(description)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(organization))
}

pub(crate) async fn list_organization_repos(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<RepoListQuery>,
) -> ApiResult<Json<Value>> {
    let auth = optional_auth(&state, &headers)?;
    let name = normalize_name(&name)?;
    get_organization_by_name(&state.pool, &name).await?;
    let repos = owner_repositories(&state, &name, query, auth.as_ref()).await?;
    Ok(Json(json!({ "data": repos })))
}

pub(crate) async fn list_organization_members(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> ApiResult<Json<Value>> {
    let name = normalize_name(&name)?;
    let members = sqlx::query(
        r#"
        SELECT users.id, users.username, users.display_name, users.avatar_url,
               organization_members.role, organization_members.created_at
        FROM organization_members
        JOIN organizations ON organizations.id = organization_members.organization_id
        JOIN users ON users.id = organization_members.user_id
        WHERE organizations.name = $1
        ORDER BY users.username ASC
        "#,
    )
    .bind(name)
    .fetch_all(&state.pool)
    .await?;
    let data = members
        .into_iter()
        .map(|row| {
            json!({
                "id": row.get::<Uuid, _>("id"),
                "username": row.get::<String, _>("username"),
                "display_name": row.get::<String, _>("display_name"),
                "avatar_url": row.get::<Option<String>, _>("avatar_url"),
                "role": row.get::<String, _>("role"),
                "created_at": row.get::<chrono::DateTime<chrono::Utc>, _>("created_at"),
            })
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "data": data })))
}

pub(crate) async fn upsert_organization_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Json(input): Json<UpsertCollaboratorRequest>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &name).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    let user = get_user_by_username(&state.pool, &normalize_name(&input.username)?).await?;
    let role = normalize_org_role(input.role.as_deref().unwrap_or("member"))?;

    sqlx::query(
        r#"
        INSERT INTO organization_members (organization_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (organization_id, user_id) DO UPDATE
        SET role = EXCLUDED.role
        "#,
    )
    .bind(organization.id)
    .bind(user.id)
    .bind(&role)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({
        "username": user.username,
        "display_name": user.display_name,
        "role": role,
    })))
}

pub(crate) async fn delete_organization_member(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((name, username)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let auth = require_auth(&state, &headers)?;
    let organization = get_organization_by_name(&state.pool, &name).await?;
    ensure_org_admin(&state.pool, organization.id, auth.id).await?;
    let user = get_user_by_username(&state.pool, &normalize_name(&username)?).await?;
    let result =
        sqlx::query("DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2")
            .bind(organization.id)
            .bind(user.id)
            .execute(&state.pool)
            .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Json(json!({ "status": "deleted" })))
}

fn normalize_org_role(role: &str) -> ApiResult<String> {
    match role.trim() {
        "owner" | "admin" | "member" => Ok(role.trim().to_string()),
        _ => Err(ApiError::BadRequest(
            "invalid organization role".to_string(),
        )),
    }
}
