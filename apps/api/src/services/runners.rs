use super::*;

pub(crate) async fn create_runner_token(
    pool: &PgPool,
    scope: &str,
    user_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    repository_id: Option<Uuid>,
    created_by: Uuid,
) -> ApiResult<Json<RunnerTokenResponse>> {
    let token = generate_token("runner-reg");
    sqlx::query(
        r#"
        INSERT INTO runner_registration_tokens
          (id, token_hash, scope_kind, user_id, organization_id, repository_id, created_by, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '30 days')
        "#,
    )
    .bind(Uuid::now_v7())
    .bind(token_hash(&token))
    .bind(scope)
    .bind(user_id)
    .bind(organization_id)
    .bind(repository_id)
    .bind(created_by)
    .execute(pool)
    .await?;

    Ok(Json(RunnerTokenResponse {
        token,
        scope: scope.to_string(),
    }))
}

pub(crate) async fn list_runners(
    pool: &PgPool,
    scope: &str,
    user_id: Option<Uuid>,
    organization_id: Option<Uuid>,
    repository_id: Option<Uuid>,
) -> ApiResult<Json<Value>> {
    let runners = sqlx::query_as::<_, Runner>(
        r#"
        SELECT id, scope_kind, user_id, organization_id, repository_id, name, labels, version, status, last_seen_at, created_at
        FROM runners
        WHERE scope_kind = $1
          AND ($2::uuid IS NULL OR user_id = $2)
          AND ($3::uuid IS NULL OR organization_id = $3)
          AND ($4::uuid IS NULL OR repository_id = $4)
        ORDER BY created_at DESC
        "#,
    )
    .bind(scope)
    .bind(user_id)
    .bind(organization_id)
    .bind(repository_id)
    .fetch_all(pool)
    .await?;

    Ok(Json(json!({ "data": runners })))
}

pub(crate) fn token_hash(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    general_purpose::STANDARD_NO_PAD.encode(digest)
}

pub(crate) fn generate_token(prefix: &str) -> String {
    format!("{}-{}", prefix, Uuid::new_v4().as_simple())
}

pub(crate) fn parse_runner_labels(labels: Option<&str>) -> Vec<String> {
    labels
        .unwrap_or("ubuntu-latest:docker://node:20-bookworm")
        .split(',')
        .map(|label| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .collect()
}
