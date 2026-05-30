use super::*;

pub(crate) fn ssh_key_fingerprint(public_key: &str) -> ApiResult<String> {
    let mut parts = public_key.split_whitespace();
    let kind = parts
        .next()
        .ok_or_else(|| ApiError::BadRequest("invalid SSH public key".to_string()))?;
    let key = parts
        .next()
        .ok_or_else(|| ApiError::BadRequest("invalid SSH public key".to_string()))?;
    if !matches!(
        kind,
        "ssh-ed25519" | "ssh-rsa" | "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384"
    ) {
        return Err(ApiError::BadRequest(
            "unsupported SSH public key type".to_string(),
        ));
    }
    let decoded = general_purpose::STANDARD
        .decode(key)
        .map_err(|_| ApiError::BadRequest("invalid SSH public key data".to_string()))?;
    let digest = Sha256::digest(decoded);
    Ok(format!(
        "SHA256:{}",
        general_purpose::STANDARD_NO_PAD.encode(digest)
    ))
}
