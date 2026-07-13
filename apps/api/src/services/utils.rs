use super::*;

pub(crate) fn normalize_name(value: &str) -> ApiResult<String> {
    let normalized = value.trim().to_ascii_lowercase();
    let valid = !normalized.is_empty()
        && normalized
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '-' || char == '_');
    if valid {
        Ok(normalized)
    } else {
        Err(ApiError::BadRequest(
            "name may only contain letters, numbers, dashes, and underscores".to_string(),
        ))
    }
}

pub(crate) fn normalize_username(value: &str) -> ApiResult<String> {
    let trimmed = value.trim();
    if trimmed.starts_with('.') || trimmed.starts_with('_') {
        return Err(ApiError::BadRequest(
            "username must not start with a dot or underscore".to_string(),
        ));
    }

    let normalized = normalize_name(trimmed)?;
    ensure_claimable_username(&normalized)?;
    Ok(normalized)
}

pub(crate) fn ensure_claimable_owner_name(name: &str) -> ApiResult<()> {
    const RESERVED_OWNER_NAMES: &[&str] = &[
        "auth",
        "activity",
        "servers",
        "admin",
        "repos",
        "organizations",
    ];

    if RESERVED_OWNER_NAMES.contains(&name) {
        return Err(ApiError::BadRequest(format!(
            "{name} is reserved and cannot be used as an owner name"
        )));
    }

    Ok(())
}

pub(crate) fn ensure_claimable_username(name: &str) -> ApiResult<()> {
    const RESERVED_USERNAMES: &[&str] = &[
        "activity",
        "admin",
        "auth",
        "dev",
        "new",
        "organizations",
        "repos",
        "search",
        "servers",
        "settings",
        "users",
    ];

    if RESERVED_USERNAMES.contains(&name) {
        return Err(ApiError::BadRequest(format!(
            "{name} is reserved and cannot be used as a username"
        )));
    }

    Ok(())
}

pub(crate) async fn enforce_rate_limit(
    state: &AppState,
    scope: &str,
    identity: &str,
    limit: u64,
    window_seconds: u64,
) -> ApiResult<()> {
    let key = cache_key(&["rate", scope, identity]);
    if state
        .cache
        .is_rate_limited(&key, limit, window_seconds)
        .await
    {
        Err(ApiError::RateLimited)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_username_rejects_reserved_or_prefixed_usernames() {
        assert!(normalize_username("search").is_err());
        assert!(normalize_username(".alice").is_err());
        assert!(normalize_username("_alice").is_err());
        assert_eq!(normalize_username("Alice_1").unwrap(), "alice_1");
    }
}
