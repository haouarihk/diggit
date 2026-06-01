use super::*;

pub(crate) async fn create_bare_repo(path: &PathBuf) -> ApiResult<()> {
    if fs::try_exists(path).await? {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let output = Command::new("git")
        .arg("init")
        .arg("--bare")
        .arg(path)
        .output()
        .await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    Ok(())
}

pub(crate) enum RepoFileChange {
    Delete,
    Write(String),
}

pub(crate) async fn repo_file_response(
    repo: &Repository,
    path: &str,
    ref_name: Option<&str>,
) -> ApiResult<RepositoryFileResponse> {
    let commit_sha = resolve_git_ref(repo, ref_name)
        .await?
        .ok_or(ApiError::NotFound)?;
    let object = format!("{}:{}", commit_sha, path);
    let kind = run_git_command(
        repo,
        &["cat-file".to_string(), "-t".to_string(), object.clone()],
    )
    .await?;
    if kind.trim() != "blob" {
        return Err(ApiError::NotFound);
    }
    let size = run_git_command(
        repo,
        &["cat-file".to_string(), "-s".to_string(), object.clone()],
    )
    .await?
    .trim()
    .parse::<i64>()
    .unwrap_or(0);
    let name = repo_path_name(path);
    let extension = file_extension(&name);
    let media_type = media_type_for_path(&name);
    let is_binary = is_binary_extension(extension.as_deref());
    let content = if is_binary {
        String::new()
    } else {
        run_git_command(repo, &["show".to_string(), object]).await?
    };

    Ok(RepositoryFileResponse {
        extension,
        name,
        path: path.to_string(),
        size,
        content,
        is_binary,
        media_type,
        last_commit: git_last_commit(repo, &commit_sha, Some(path)).await?,
    })
}

pub(crate) async fn commit_repo_file_change(
    repo: &Repository,
    auth: &AuthUser,
    path: &str,
    change: RepoFileChange,
    message: String,
) -> ApiResult<()> {
    let worktree = env::temp_dir().join(format!("diggit-worktree-{}", Uuid::now_v7()));
    fs::create_dir_all(&worktree).await?;

    let result =
        commit_repo_file_change_in_worktree(repo, auth, path, change, message, &worktree).await;
    let _ = fs::remove_dir_all(&worktree).await;
    result
}

pub(crate) async fn commit_repo_file_change_in_worktree(
    repo: &Repository,
    auth: &AuthUser,
    path: &str,
    change: RepoFileChange,
    message: String,
    worktree: &PathBuf,
) -> ApiResult<()> {
    run_git_worktree_command(
        repo,
        worktree,
        &[
            "checkout".to_string(),
            "-f".to_string(),
            repo.default_branch.clone(),
        ],
    )
    .await?;

    match change {
        RepoFileChange::Write(content) => {
            let file_path = worktree.join(path);
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::write(file_path, content).await?;
            run_git_worktree_command(
                repo,
                worktree,
                &["add".to_string(), "--".to_string(), path.to_string()],
            )
            .await?;
        }
        RepoFileChange::Delete => {
            run_git_worktree_command(
                repo,
                worktree,
                &[
                    "rm".to_string(),
                    "-r".to_string(),
                    "--".to_string(),
                    path.to_string(),
                ],
            )
            .await?;
        }
    }

    let diff = git_worktree_command(
        repo,
        worktree,
        &[
            "diff".to_string(),
            "--cached".to_string(),
            "--quiet".to_string(),
        ],
    )
    .await?;
    if diff.status.success() {
        return Err(ApiError::BadRequest("no changes to commit".to_string()));
    }

    let author_name = auth.username.clone();
    let author_email = format!("{}@diggit.local", auth.username);
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&repo.local_path)
        .arg("--work-tree")
        .arg(worktree)
        .arg("commit")
        .arg("-m")
        .arg(message)
        .env("GIT_AUTHOR_NAME", &author_name)
        .env("GIT_AUTHOR_EMAIL", &author_email)
        .env("GIT_COMMITTER_NAME", &author_name)
        .env("GIT_COMMITTER_EMAIL", &author_email);
    let output = command.output().await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(())
}

pub(crate) async fn resolve_git_ref(
    repo: &Repository,
    requested: Option<&str>,
) -> ApiResult<Option<String>> {
    let candidates = if let Some(ref_name) = requested {
        vec![ref_name.to_string()]
    } else {
        vec![repo.default_branch.clone(), "HEAD".to_string()]
    };

    for ref_name in candidates {
        if ref_name.trim().is_empty() || ref_name.contains('\0') {
            continue;
        }
        let spec = format!("{}^{{commit}}", ref_name);
        let output = try_run_git_command(
            repo,
            &["rev-parse".to_string(), "--verify".to_string(), spec],
        )
        .await?;
        if let Some(sha) = output
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            return Ok(Some(sha));
        }
    }

    Ok(None)
}

pub(crate) async fn git_last_commit(
    repo: &Repository,
    commit_sha: &str,
    path: Option<&str>,
) -> ApiResult<Option<RepositoryCommitResponse>> {
    let mut args = vec![
        "log".to_string(),
        "-1".to_string(),
        "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
        commit_sha.to_string(),
    ];

    if let Some(path) = path {
        args.push("--".to_string());
        args.push(path.to_string());
    }

    let output = try_run_git_command(repo, &args).await?;
    Ok(output.and_then(|value| parse_git_commit(&value)))
}

pub(crate) async fn list_commits(
    repo: &Repository,
    ref_name: Option<&str>,
    limit: usize,
) -> ApiResult<Vec<RepositoryCommitResponse>> {
    let target = resolve_git_ref(repo, ref_name)
        .await?
        .unwrap_or_else(|| repo.default_branch.clone());
    let output = try_run_git_command(
        repo,
        &[
            "log".to_string(),
            format!("--max-count={}", limit.clamp(1, 100)),
            "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
            target,
        ],
    )
    .await?;
    Ok(output
        .unwrap_or_default()
        .lines()
        .filter_map(parse_git_commit)
        .collect())
}

pub(crate) async fn commit_detail(
    repo: &Repository,
    sha: &str,
) -> ApiResult<RepositoryCommitDetailResponse> {
    let commit = git_last_commit(repo, sha, None)
        .await?
        .ok_or(ApiError::NotFound)?;
    let parents = run_git_command(
        repo,
        &["show".to_string(), "-s".to_string(), "--format=%P".to_string(), sha.to_string()],
    )
    .await?
    .split_whitespace()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let base = parents
        .first()
        .cloned()
        .unwrap_or_else(|| format!("{sha}^"));
    let files = diff_between(repo, &base, sha).await.unwrap_or_default();

    Ok(RepositoryCommitDetailResponse {
        commit,
        parents,
        files,
    })
}

pub(crate) async fn diff_between(
    repo: &Repository,
    base: &str,
    head: &str,
) -> ApiResult<Vec<RepositoryDiffFileResponse>> {
    let output = try_run_git_command(
        repo,
        &[
            "diff".to_string(),
            "--find-renames".to_string(),
            "--patch".to_string(),
            base.to_string(),
            head.to_string(),
        ],
    )
    .await?;
    Ok(parse_git_diff(&output.unwrap_or_default()))
}

pub(crate) async fn fetch_upstream_ref(
    fork: &Repository,
    upstream_url: &str,
    branch: &str,
) -> ApiResult<String> {
    let upstream_ref = format!("refs/remotes/diggit-upstream/{}", normalize_path_segment(branch));
    run_git_command(
        fork,
        &[
            "fetch".to_string(),
            "--force".to_string(),
            upstream_url.to_string(),
            format!("refs/heads/{branch}:{upstream_ref}"),
        ],
    )
    .await?;
    Ok(upstream_ref)
}

pub(crate) async fn initialize_fork_from_source(
    fork: &Repository,
    source_url: &str,
) -> ApiResult<()> {
    run_git_command(
        fork,
        &[
            "fetch".to_string(),
            "--force".to_string(),
            source_url.to_string(),
            "+refs/heads/*:refs/heads/*".to_string(),
            "+HEAD:refs/heads/main".to_string(),
        ],
    )
    .await
    .map(|_| ())
}

pub(crate) async fn try_initialize_fork_from_source(fork: &Repository, source_url: &str) {
    let _ = initialize_fork_from_source(fork, source_url).await;
}

pub(crate) async fn ahead_behind(
    repo: &Repository,
    upstream_ref: &str,
    fork_ref: &str,
) -> ApiResult<(i32, i32)> {
    let output = run_git_command(
        repo,
        &[
            "rev-list".to_string(),
            "--left-right".to_string(),
            "--count".to_string(),
            format!("{upstream_ref}...{fork_ref}"),
        ],
    )
    .await?;
    parse_ahead_behind(&output)
}

pub(crate) async fn compare_refs(
    repo: &Repository,
    source: Option<RepositorySourceResponse>,
    upstream_ref: &str,
    fork_ref: &str,
) -> ApiResult<RepositoryCompareResponse> {
    let (behind_by, ahead_by) = ahead_behind(repo, upstream_ref, fork_ref).await?;
    let ahead_commits = commits_between(repo, fork_ref, upstream_ref).await?;
    let behind_commits = commits_between(repo, upstream_ref, fork_ref).await?;
    let files = diff_between(repo, upstream_ref, fork_ref).await?;
    let status = if ahead_by == 0 && behind_by == 0 {
        "up_to_date"
    } else if ahead_by > 0 && behind_by > 0 {
        "diverged"
    } else if behind_by > 0 {
        "behind"
    } else {
        "ahead"
    };

    Ok(RepositoryCompareResponse {
        status: status.to_string(),
        source,
        ahead_by,
        behind_by,
        ahead_commits,
        behind_commits,
        files,
        message: None,
    })
}

pub(crate) async fn commits_between(
    repo: &Repository,
    include_ref: &str,
    exclude_ref: &str,
) -> ApiResult<Vec<RepositoryCommitResponse>> {
    let output = try_run_git_command(
        repo,
        &[
            "log".to_string(),
            "--max-count=50".to_string(),
            "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
            include_ref.to_string(),
            "--not".to_string(),
            exclude_ref.to_string(),
        ],
    )
    .await?;
    Ok(output
        .unwrap_or_default()
        .lines()
        .filter_map(parse_git_commit)
        .collect())
}

pub(crate) async fn sync_from_upstream(
    fork: &Repository,
    upstream_ref: &str,
    author: &AuthUser,
) -> ApiResult<()> {
    let worktree = env::temp_dir().join(format!("diggit-sync-{}", Uuid::now_v7()));
    fs::create_dir_all(&worktree).await?;

    let result = sync_from_upstream_in_worktree(fork, upstream_ref, author, &worktree).await;
    let _ = fs::remove_dir_all(&worktree).await;
    result
}

async fn sync_from_upstream_in_worktree(
    fork: &Repository,
    upstream_ref: &str,
    author: &AuthUser,
    worktree: &PathBuf,
) -> ApiResult<()> {
    run_git_worktree_command(
        fork,
        worktree,
        &[
            "checkout".to_string(),
            "-f".to_string(),
            fork.default_branch.clone(),
        ],
    )
    .await?;
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&fork.local_path)
        .arg("--work-tree")
        .arg(worktree)
        .arg("merge")
        .arg("--no-edit")
        .arg(upstream_ref)
        .env("GIT_AUTHOR_NAME", &author.username)
        .env("GIT_AUTHOR_EMAIL", format!("{}@diggit.local", author.username))
        .env("GIT_COMMITTER_NAME", &author.username)
        .env("GIT_COMMITTER_EMAIL", format!("{}@diggit.local", author.username));
    let output = command.output().await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
}

pub(crate) async fn run_git_command(repo: &Repository, args: &[String]) -> ApiResult<String> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) async fn run_git_command_bytes(
    repo: &Repository,
    args: &[String],
) -> ApiResult<Vec<u8>> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(output.stdout)
}

pub(crate) async fn try_run_git_command(
    repo: &Repository,
    args: &[String],
) -> ApiResult<Option<String>> {
    let output = git_command(repo, args).await?;
    if !output.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).to_string()))
}

pub(crate) async fn git_command(
    repo: &Repository,
    args: &[String],
) -> ApiResult<std::process::Output> {
    let mut command = Command::new("git");
    command.arg("--git-dir").arg(&repo.local_path);
    for arg in args {
        command.arg(arg);
    }
    Ok(command.output().await?)
}

pub(crate) async fn run_git_worktree_command(
    repo: &Repository,
    worktree: &PathBuf,
    args: &[String],
) -> ApiResult<String> {
    let output = git_worktree_command(repo, worktree, args).await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub(crate) async fn git_worktree_command(
    repo: &Repository,
    worktree: &PathBuf,
    args: &[String],
) -> ApiResult<std::process::Output> {
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&repo.local_path)
        .arg("--work-tree")
        .arg(worktree);
    for arg in args {
        command.arg(arg);
    }
    Ok(command.output().await?)
}

pub(crate) fn parse_git_commit(output: &str) -> Option<RepositoryCommitResponse> {
    let mut parts = output.trim_end().split('\x1f');
    let sha = parts.next()?.trim();
    if sha.is_empty() {
        return None;
    }
    let message = parts.next().unwrap_or_default().to_string();
    let created_at = parts.next().unwrap_or_default().to_string();
    let author_name = parts.next().unwrap_or("Unknown author").to_string();
    let author_email = parts.next().unwrap_or_default().to_string();

    Some(RepositoryCommitResponse {
        sha: sha.to_string(),
        message,
        avatar_fallback: avatar_fallback(&author_name),
        author_name,
        author_email,
        created_at,
    })
}

pub(crate) fn parse_ahead_behind(output: &str) -> ApiResult<(i32, i32)> {
    let mut parts = output.split_whitespace();
    let left = parts
        .next()
        .and_then(|value| value.parse::<i32>().ok())
        .ok_or_else(|| ApiError::BadRequest("invalid ahead/behind output".to_string()))?;
    let right = parts
        .next()
        .and_then(|value| value.parse::<i32>().ok())
        .ok_or_else(|| ApiError::BadRequest("invalid ahead/behind output".to_string()))?;
    Ok((left, right))
}

pub(crate) fn parse_git_diff(output: &str) -> Vec<RepositoryDiffFileResponse> {
    let mut files = Vec::new();
    let mut current: Option<RepositoryDiffFileResponse> = None;
    let mut current_hunk: Option<RepositoryDiffHunkResponse> = None;
    let mut old_line = 0;
    let mut new_line = 0;

    for line in output.lines() {
        if line.starts_with("diff --git ") {
            push_hunk(&mut current, &mut current_hunk);
            if let Some(file) = current.take() {
                files.push(file);
            }
            let (old_path, new_path) = parse_diff_paths(line);
            current = Some(RepositoryDiffFileResponse {
                old_path,
                new_path,
                status: "modified".to_string(),
                additions: 0,
                deletions: 0,
                hunks: Vec::new(),
            });
            continue;
        }

        let Some(file) = current.as_mut() else {
            continue;
        };

        if line.starts_with("new file mode") {
            file.status = "added".to_string();
            continue;
        }
        if line.starts_with("deleted file mode") {
            file.status = "deleted".to_string();
            continue;
        }
        if line.starts_with("rename from ") {
            file.status = "renamed".to_string();
            file.old_path = Some(line.trim_start_matches("rename from ").to_string());
            continue;
        }
        if line.starts_with("rename to ") {
            file.status = "renamed".to_string();
            file.new_path = Some(line.trim_start_matches("rename to ").to_string());
            continue;
        }
        if line.starts_with("@@") {
            push_hunk(&mut current, &mut current_hunk);
            let (old_start, new_start) = parse_hunk_header(line);
            old_line = old_start;
            new_line = new_start;
            current_hunk = Some(RepositoryDiffHunkResponse {
                header: line.to_string(),
                lines: Vec::new(),
            });
            continue;
        }

        let Some(hunk) = current_hunk.as_mut() else {
            continue;
        };
        if line.starts_with('+') && !line.starts_with("+++") {
            file.additions += 1;
            hunk.lines.push(RepositoryDiffLineResponse {
                kind: "addition".to_string(),
                old_line: None,
                new_line: Some(new_line),
                content: line.trim_start_matches('+').to_string(),
            });
            new_line += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            file.deletions += 1;
            hunk.lines.push(RepositoryDiffLineResponse {
                kind: "deletion".to_string(),
                old_line: Some(old_line),
                new_line: None,
                content: line.trim_start_matches('-').to_string(),
            });
            old_line += 1;
        } else if line.starts_with(' ') {
            hunk.lines.push(RepositoryDiffLineResponse {
                kind: "context".to_string(),
                old_line: Some(old_line),
                new_line: Some(new_line),
                content: line.trim_start_matches(' ').to_string(),
            });
            old_line += 1;
            new_line += 1;
        }
    }

    push_hunk(&mut current, &mut current_hunk);
    if let Some(file) = current {
        files.push(file);
    }

    files
}

fn push_hunk(
    file: &mut Option<RepositoryDiffFileResponse>,
    hunk: &mut Option<RepositoryDiffHunkResponse>,
) {
    if let (Some(file), Some(hunk)) = (file.as_mut(), hunk.take()) {
        file.hunks.push(hunk);
    }
}

fn parse_diff_paths(line: &str) -> (Option<String>, Option<String>) {
    let mut parts = line.split_whitespace().skip(2);
    let old_path = parts.next().map(trim_git_path);
    let new_path = parts.next().map(trim_git_path);
    (old_path, new_path)
}

fn trim_git_path(path: &str) -> String {
    path.trim_start_matches("a/")
        .trim_start_matches("b/")
        .to_string()
}

fn parse_hunk_header(line: &str) -> (i32, i32) {
    let mut old_start = 0;
    let mut new_start = 0;
    for part in line.split_whitespace() {
        if let Some(value) = part.strip_prefix('-') {
            old_start = value
                .split(',')
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
        if let Some(value) = part.strip_prefix('+') {
            new_start = value
                .split(',')
                .next()
                .and_then(|value| value.parse().ok())
                .unwrap_or(0);
        }
    }
    (old_start, new_start)
}

pub(crate) fn parse_ls_tree_line(line: &str) -> Option<(String, String, Option<i64>)> {
    let (metadata, path) = line.split_once('\t')?;
    let parts: Vec<&str> = metadata.split_whitespace().collect();
    if parts.len() < 4 {
        return None;
    }

    let kind = if parts[1] == "tree" {
        "directory"
    } else {
        "file"
    }
    .to_string();
    let size = parts[3].parse::<i64>().ok();
    Some((path.to_string(), kind, size))
}

pub(crate) fn normalize_repo_file_path(path: &str) -> ApiResult<String> {
    let normalized = path.trim().trim_start_matches('/').to_string();
    let invalid = normalized.is_empty()
        || normalized.contains('\0')
        || normalized
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..");

    if invalid {
        return Err(ApiError::BadRequest("invalid repository path".to_string()));
    }

    Ok(normalized)
}

pub(crate) fn repo_path_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or(path).to_string()
}

pub(crate) fn file_extension(name: &str) -> Option<String> {
    name.rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .filter(|extension| !extension.is_empty())
}

pub(crate) fn is_binary_extension(extension: Option<&str>) -> bool {
    matches!(
        extension,
        Some("avif" | "gif" | "jpeg" | "jpg" | "mov" | "mp4" | "pdf" | "png" | "webm" | "webp")
    )
}

pub(crate) fn media_type_for_path(path: &str) -> String {
    match file_extension(path).as_deref() {
        Some("avif") => "image/avif",
        Some("gif") => "image/gif",
        Some("jpeg") | Some("jpg") => "image/jpeg",
        Some("md") | Some("mdx") => "text/markdown; charset=utf-8",
        Some("mov") => "video/quicktime",
        Some("mp4") => "video/mp4",
        Some("pdf") => "application/pdf",
        Some("png") => "image/png",
        Some("svg") => "image/svg+xml",
        Some("webm") => "video/webm",
        Some("webp") => "image/webp",
        Some("json") => "application/json; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "text/plain; charset=utf-8",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ahead_behind_counts() {
        assert_eq!(parse_ahead_behind("3\t2\n").unwrap(), (3, 2));
        assert!(parse_ahead_behind("bad").is_err());
    }

    #[test]
    fn parses_patch_into_structured_diff() {
        let diff = r#"diff --git a/src/main.ts b/src/main.ts
index 1111111..2222222 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,3 +1,4 @@
 const name = "diggit";
-console.log(name);
+console.info(name);
+console.info("fork");
 export {};
"#;

        let files = parse_git_diff(diff);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].new_path.as_deref(), Some("src/main.ts"));
        assert_eq!(files[0].additions, 2);
        assert_eq!(files[0].deletions, 1);
        assert_eq!(files[0].hunks[0].lines[1].kind, "deletion");
        assert_eq!(files[0].hunks[0].lines[2].kind, "addition");
    }
}
