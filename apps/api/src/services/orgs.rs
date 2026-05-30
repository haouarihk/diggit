use super::*;

pub(crate) async fn get_organization_by_name(pool: &PgPool, name: &str) -> ApiResult<Organization> {
    Ok(
        sqlx::query_as::<_, Organization>("SELECT * FROM organizations WHERE name = $1")
            .bind(normalize_name(name)?)
            .fetch_one(pool)
            .await?,
    )
}

pub(crate) async fn ensure_org_member(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> ApiResult<()> {
    let membership: Option<(String,)> = sqlx::query_as(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    if membership.is_none() {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

pub(crate) async fn ensure_org_admin(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> ApiResult<()> {
    let membership: Option<(String,)> = sqlx::query_as(
        "SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    match membership.as_ref().map(|(role,)| role.as_str()) {
        Some("owner" | "admin") => Ok(()),
        _ => Err(ApiError::Unauthorized),
    }
}
