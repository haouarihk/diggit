use super::*;
use sqlx::Row;
use std::{collections::HashMap, process::Stdio};

const GIT_COMMAND_TIMEOUT_SECONDS: u64 = 30;
const MAX_GIT_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_RAW_FILE_BYTES: i64 = 10 * 1024 * 1024;

pub(crate) async fn create_bare_repo(path: &PathBuf) -> ApiResult<()> {
    if fs::try_exists(path).await? {
        ensure_bare_repo_head(path, "main").await?;
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }

    let output = Command::new("git")
        .arg("init")
        .arg("--bare")
        .arg("--initial-branch=main")
        .arg(path)
        .output()
        .await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }
    ensure_bare_repo_head(path, "main").await?;
    Ok(())
}

pub(crate) async fn ensure_repo_head(repo: &Repository) -> ApiResult<()> {
    ensure_bare_repo_head(&PathBuf::from(&repo.local_path), &repo.default_branch).await
}

async fn ensure_bare_repo_head(path: &PathBuf, branch: &str) -> ApiResult<()> {
    if branch.trim().is_empty() || branch.contains('\0') || branch.starts_with('-') {
        return Err(ApiError::BadRequest("invalid default branch".to_string()));
    }

    let output = Command::new("git")
        .arg("--git-dir")
        .arg(path)
        .arg("symbolic-ref")
        .arg("HEAD")
        .arg(format!("refs/heads/{branch}"))
        .output()
        .await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok(())
}

pub(crate) async fn list_branches(repo: &Repository) -> ApiResult<Vec<RepositoryBranchResponse>> {
    let output = try_run_git_command(
        repo,
        &[
            "for-each-ref".to_string(),
            "--format=%(refname:short)%00%(objectname)".to_string(),
            "refs/heads".to_string(),
        ],
    )
    .await?;
    let mut branches = output
        .unwrap_or_default()
        .lines()
        .filter_map(|line| parse_branch_line(line, &repo.default_branch))
        .collect::<Vec<_>>();

    if branches.is_empty() {
        branches.push(RepositoryBranchResponse {
            name: repo.default_branch.clone(),
            is_default: true,
            commit_sha: None,
        });
    }

    branches.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(branches)
}

pub(crate) enum RepoFileChange {
    Delete,
    Write(String),
}

fn parse_branch_line(line: &str, default_branch: &str) -> Option<RepositoryBranchResponse> {
    let mut parts = line.split('\0');
    let name = parts.next()?.trim();
    let commit_sha = parts.next()?.trim();
    if name.is_empty() || commit_sha.is_empty() {
        return None;
    }

    Some(RepositoryBranchResponse {
        name: name.to_string(),
        is_default: name == default_branch,
        commit_sha: Some(commit_sha.to_string()),
    })
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
    if !is_binary && size > MAX_GIT_OUTPUT_BYTES as i64 {
        return Err(ApiError::BadRequest(
            "file is too large to render".to_string(),
        ));
    }
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
) -> ApiResult<String> {
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
) -> ApiResult<String> {
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

    let sha = run_git_worktree_command(
        repo,
        worktree,
        &["rev-parse".to_string(), "HEAD".to_string()],
    )
    .await?
    .trim()
    .to_string();
    Ok(sha)
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
    let mut args = vec![
        "log".to_string(),
        "--format=%H%x1f%s%x1f%cI%x1f%an%x1f%ae".to_string(),
        target,
    ];
    if limit > 0 {
        args.insert(1, format!("--max-count={}", limit.clamp(1, 1000)));
    }
    let output = try_run_git_command(repo, &args).await?;
    Ok(output
        .unwrap_or_default()
        .lines()
        .filter_map(parse_git_commit)
        .collect())
}

pub(crate) async fn attach_commit_account_authors(
    pool: &PgPool,
    repo: &Repository,
    commits: &mut [RepositoryCommitResponse],
) -> ApiResult<()> {
    if commits.is_empty() {
        return Ok(());
    }

    let commit_author_users = sqlx::query(
        r#"
        SELECT repository_commit_authors.commit_sha, users.username, users.display_name, users.avatar_url
        FROM repository_commit_authors
        JOIN users ON users.id = repository_commit_authors.user_id
        WHERE repository_commit_authors.repository_id = $1
        "#,
    )
    .bind(repo.id)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| {
        (
            row.get::<String, _>("commit_sha"),
            CommitAccountAuthor {
                avatar_url: row.get::<Option<String>, _>("avatar_url"),
                display_name: row.get::<String, _>("display_name"),
                username: row.get::<String, _>("username"),
            },
        )
    })
    .collect::<HashMap<_, _>>();

    for commit in commits {
        if let Some(author) = commit_author_users.get(&commit.sha) {
            commit.author_name = author.display_name.clone();
            commit.author_email = account_email(&author.username);
            commit.author_username = Some(author.username.clone());
            commit.author_avatar_url = author.avatar_url.clone();
            commit.avatar_fallback = avatar_fallback(&author.display_name);
        }
    }

    Ok(())
}

struct CommitAccountAuthor {
    username: String,
    display_name: String,
    avatar_url: Option<String>,
}

pub(crate) async fn repository_stats(
    state: &AppState,
    repo: &Repository,
    ref_name: Option<&str>,
) -> ApiResult<RepositoryStatsResponse> {
    let commit_sha = resolve_git_ref(repo, ref_name).await?;
    let cache_suffix = commit_sha.as_deref().unwrap_or("empty");
    let cache_key = cache_key(&[
        "repo",
        &repo.owner_handle,
        &repo.name,
        "stats",
        cache_suffix,
    ]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryStatsResponse>(&cache_key)
        .await
    {
        return Ok(cached);
    }

    let commits_count = if let Some(commit_sha) = commit_sha {
        count_git_output_lines(
            try_run_git_command(
                repo,
                &["rev-list".to_string(), "--count".to_string(), commit_sha],
            )
            .await?
            .as_deref(),
        )
    } else {
        0
    };
    let branches_count = list_branches(repo).await?.len() as i64;
    let tags_count = count_git_output_lines(
        try_run_git_command(
            repo,
            &[
                "for-each-ref".to_string(),
                "--format=%(refname:short)".to_string(),
                "refs/tags".to_string(),
            ],
        )
        .await?
        .as_deref(),
    );
    let response = RepositoryStatsResponse {
        branches_count,
        commits_count,
        releases_count: 0,
        tags_count,
    };
    state.cache.set_json(&cache_key, &response).await;
    Ok(response)
}

pub(crate) async fn git_ref_tips(repo: &Repository) -> ApiResult<Vec<String>> {
    let output = try_run_git_command(
        repo,
        &[
            "for-each-ref".to_string(),
            "--format=%(objectname)".to_string(),
            "refs/heads".to_string(),
        ],
    )
    .await?;
    Ok(output
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| is_full_sha(line))
        .map(str::to_string)
        .collect())
}

pub(crate) async fn record_pushed_commit_authors(
    state: &AppState,
    repo: &Repository,
    auth: &AuthUser,
    before_tips: &[String],
) -> ApiResult<()> {
    let after_tips = git_ref_tips(repo).await?;
    if after_tips.is_empty() {
        return Ok(());
    }

    let mut args = vec!["rev-list".to_string()];
    args.extend(after_tips);
    if !before_tips.is_empty() {
        args.push("--not".to_string());
        args.extend(before_tips.iter().cloned());
    }

    let output = try_run_git_command(repo, &args).await?.unwrap_or_default();
    for sha in output
        .lines()
        .map(str::trim)
        .filter(|line| is_full_sha(line))
    {
        record_commit_author(state, repo, auth, sha).await?;
    }

    Ok(())
}

pub(crate) async fn record_commit_author(
    state: &AppState,
    repo: &Repository,
    auth: &AuthUser,
    sha: &str,
) -> ApiResult<()> {
    if !is_full_sha(sha) {
        return Ok(());
    }

    sqlx::query(
        r#"
        INSERT INTO repository_commit_authors (repository_id, commit_sha, user_id, pushed_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (repository_id, commit_sha) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            pushed_at = EXCLUDED.pushed_at
        "#,
    )
    .bind(repo.id)
    .bind(sha)
    .bind(auth.id)
    .execute(&state.pool)
    .await?;

    Ok(())
}

pub(crate) async fn repository_languages(
    state: &AppState,
    repo: &Repository,
    ref_name: Option<&str>,
) -> ApiResult<RepositoryLanguageListResponse> {
    let Some(commit_sha) = resolve_git_ref(repo, ref_name).await? else {
        return Ok(RepositoryLanguageListResponse { data: Vec::new() });
    };
    let cache_key = cache_key(&[
        "repo",
        &repo.owner_handle,
        &repo.name,
        "languages",
        &commit_sha,
    ]);
    if let Some(cached) = state
        .cache
        .get_json::<RepositoryLanguageListResponse>(&cache_key)
        .await
    {
        return Ok(cached);
    }

    let output = run_git_command(
        repo,
        &[
            "ls-tree".to_string(),
            "-r".to_string(),
            "-l".to_string(),
            commit_sha,
        ],
    )
    .await?;
    let mut language_bytes: HashMap<&'static str, i64> = HashMap::new();

    for line in output.lines() {
        let Some((metadata, path)) = line.split_once('\t') else {
            continue;
        };
        let Some(language) = language_for_path(path) else {
            continue;
        };
        let size = metadata
            .split_whitespace()
            .nth(3)
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|size| *size > 0)
            .unwrap_or(1);
        *language_bytes.entry(language).or_insert(0) += size;
    }

    let total_bytes: i64 = language_bytes.values().sum();
    let mut data = language_bytes
        .into_iter()
        .map(|(language, bytes)| RepositoryLanguageResponse {
            language: language.to_string(),
            bytes,
            percentage: if total_bytes > 0 {
                ((bytes as f64 / total_bytes as f64) * 1000.0).round() / 10.0
            } else {
                0.0
            },
            color: language_color(language).to_string(),
        })
        .collect::<Vec<_>>();
    data.sort_by(|left, right| {
        right
            .bytes
            .cmp(&left.bytes)
            .then_with(|| left.language.cmp(&right.language))
    });

    let response = RepositoryLanguageListResponse { data };
    state.cache.set_json(&cache_key, &response).await;
    Ok(response)
}

pub(crate) async fn repository_contributors(
    pool: &PgPool,
    repo: &Repository,
    ref_name: Option<&str>,
) -> ApiResult<RepositoryContributorListResponse> {
    let Some(commit_sha) = resolve_git_ref(repo, ref_name).await? else {
        return Ok(RepositoryContributorListResponse { data: Vec::new() });
    };
    let output = try_run_git_command(
        repo,
        &[
            "log".to_string(),
            "--format=%H%x1f%an%x1f%ae".to_string(),
            commit_sha,
        ],
    )
    .await?
    .unwrap_or_default();
    let mut contributors: HashMap<String, ContributorAccumulator> = HashMap::new();
    let mut commit_author_users = HashMap::new();

    for row in sqlx::query(
        r#"
        SELECT repository_commit_authors.commit_sha, users.id, users.username, users.display_name, users.avatar_url
        FROM repository_commit_authors
        JOIN users ON users.id = repository_commit_authors.user_id
        WHERE repository_commit_authors.repository_id = $1
        "#,
    )
    .bind(repo.id)
    .fetch_all(pool)
    .await?
    {
        commit_author_users.insert(
            row.get::<String, _>("commit_sha"),
            UserContributorMatch {
                avatar_url: row.get::<Option<String>, _>("avatar_url"),
                display_name: row.get::<String, _>("display_name"),
                id: row.get::<Uuid, _>("id"),
                username: row.get::<String, _>("username"),
            },
        );
    }

    let mut users = HashMap::new();
    for row in sqlx::query("SELECT id, username, display_name, avatar_url FROM users")
        .fetch_all(pool)
        .await?
    {
        let id = row.get::<Uuid, _>("id");
        let username = row.get::<String, _>("username");
        let display_name = row.get::<String, _>("display_name");
        let avatar_url = row.get::<Option<String>, _>("avatar_url");
        let user = UserContributorMatch {
            avatar_url,
            display_name,
            id,
            username,
        };
        insert_user_match(&mut users, user.username.to_ascii_lowercase(), &user);
        insert_user_match(&mut users, user.display_name.to_ascii_lowercase(), &user);
        insert_user_match(
            &mut users,
            account_email(&user.username).to_ascii_lowercase(),
            &user,
        );
    }

    for line in output.lines() {
        let mut parts = line.split('\x1f');
        let sha = parts.next().unwrap_or_default().trim();
        let name = parts.next().unwrap_or("Unknown author").trim();
        let email = parts.next().unwrap_or_default().trim();
        if let Some(user) = commit_author_users
            .get(sha)
            .or_else(|| matched_user_for_commit(&users, name, email))
        {
            add_user_contribution(&mut contributors, user);
            continue;
        }
        if name.is_empty() && email.is_empty() {
            continue;
        }
        let key = if email.is_empty() { name } else { email }.to_ascii_lowercase();
        let entry = contributors
            .entry(key)
            .or_insert_with(|| ContributorAccumulator {
                avatar_url: None,
                name: if name.is_empty() {
                    email.to_string()
                } else {
                    name.to_string()
                },
                email: email.to_string(),
                username: None,
                commits: 0,
            });
        entry.commits += 1;
    }

    let mut data = contributors
        .into_values()
        .map(|contributor| {
            let email_username = contributor.email.split('@').next().unwrap_or_default();
            let user_match = users
                .get(&contributor.name.to_ascii_lowercase())
                .or_else(|| users.get(&email_username.to_ascii_lowercase()));
            let username = contributor
                .username
                .clone()
                .or_else(|| user_match.map(|user| user.username.clone()));
            let name = if contributor.username.is_some() {
                contributor.name
            } else {
                user_match
                    .map(|user| user.display_name.clone())
                    .unwrap_or(contributor.name)
            };
            let avatar_url = contributor
                .avatar_url
                .or_else(|| user_match.and_then(|user| user.avatar_url.clone()));

            RepositoryContributorResponse {
                avatar_fallback: avatar_fallback(&name),
                avatar_url,
                commits: contributor.commits,
                name,
                username,
            }
        })
        .collect::<Vec<_>>();
    data.sort_by(|left, right| {
        right
            .commits
            .cmp(&left.commits)
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(RepositoryContributorListResponse { data })
}

struct ContributorAccumulator {
    name: String,
    email: String,
    username: Option<String>,
    avatar_url: Option<String>,
    commits: i64,
}

#[derive(Clone)]
struct UserContributorMatch {
    id: Uuid,
    username: String,
    display_name: String,
    avatar_url: Option<String>,
}

fn insert_user_match(
    users: &mut HashMap<String, UserContributorMatch>,
    key: String,
    user: &UserContributorMatch,
) {
    if !key.trim().is_empty() {
        users.entry(key).or_insert_with(|| user.clone());
    }
}

fn matched_user_for_commit<'a>(
    users: &'a HashMap<String, UserContributorMatch>,
    name: &str,
    email: &str,
) -> Option<&'a UserContributorMatch> {
    users
        .get(&name.to_ascii_lowercase())
        .or_else(|| users.get(&email.to_ascii_lowercase()))
        .or_else(|| {
            let email_username = email.split('@').next().unwrap_or_default();
            users.get(&email_username.to_ascii_lowercase())
        })
}

fn add_user_contribution(
    contributors: &mut HashMap<String, ContributorAccumulator>,
    user: &UserContributorMatch,
) {
    let entry = contributors
        .entry(format!("user:{}", user.id))
        .or_insert_with(|| ContributorAccumulator {
            avatar_url: user.avatar_url.clone(),
            email: account_email(&user.username),
            name: user.display_name.clone(),
            username: Some(user.username.clone()),
            commits: 0,
        });
    entry.commits += 1;
}

fn count_git_output_lines(output: Option<&str>) -> i64 {
    let Some(output) = output else {
        return 0;
    };
    if let Ok(count) = output.trim().parse::<i64>() {
        return count;
    }
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count() as i64
}

fn is_full_sha(value: &str) -> bool {
    value.len() == 40 && value.chars().all(|char| char.is_ascii_hexdigit())
}

fn account_email(username: &str) -> String {
    format!("{username}@diggit.local")
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
        &[
            "show".to_string(),
            "-s".to_string(),
            "--format=%P".to_string(),
            sha.to_string(),
        ],
    )
    .await?
    .split_whitespace()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let files = if let Some(base) = parents.first() {
        diff_between(repo, base, sha).await.unwrap_or_default()
    } else {
        diff_root_commit(repo, sha).await.unwrap_or_default()
    };

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

pub(crate) async fn diff_root_commit(
    repo: &Repository,
    sha: &str,
) -> ApiResult<Vec<RepositoryDiffFileResponse>> {
    let output = try_run_git_command(
        repo,
        &[
            "show".to_string(),
            "--format=".to_string(),
            "--find-renames".to_string(),
            "--patch".to_string(),
            "--root".to_string(),
            sha.to_string(),
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
    validate_git_source(upstream_url)?;
    let upstream_ref = format!(
        "refs/remotes/diggit-upstream/{}",
        normalize_path_segment(branch)
    );
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

pub(crate) async fn fetch_pull_request_ref(
    target: &Repository,
    source_url: &str,
    source_branch: &str,
    pull_request_id: Uuid,
) -> ApiResult<String> {
    validate_git_source(source_url)?;
    let source_ref = format!(
        "refs/remotes/diggit-prs/{}/{}",
        pull_request_id,
        normalize_path_segment(source_branch)
    );
    run_git_command(
        target,
        &[
            "fetch".to_string(),
            "--force".to_string(),
            source_url.to_string(),
            format!("refs/heads/{source_branch}:{source_ref}"),
        ],
    )
    .await?;
    Ok(source_ref)
}

pub(crate) async fn initialize_fork_from_source(
    fork: &Repository,
    source_url: &str,
) -> ApiResult<()> {
    validate_git_source(source_url)?;
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

fn validate_git_source(source_url: &str) -> ApiResult<()> {
    if source_url.contains("://") {
        validate_remote_url(source_url)?;
    }
    Ok(())
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

pub(crate) async fn merge_ref_into_branch(
    repo: &Repository,
    target_branch: &str,
    source_ref: &str,
    author: &AuthUser,
) -> ApiResult<()> {
    let worktree = env::temp_dir().join(format!("diggit-merge-{}", Uuid::now_v7()));
    fs::create_dir_all(&worktree).await?;

    let result =
        merge_ref_into_branch_in_worktree(repo, target_branch, source_ref, author, &worktree).await;
    let _ = fs::remove_dir_all(&worktree).await;
    result
}

async fn merge_ref_into_branch_in_worktree(
    repo: &Repository,
    target_branch: &str,
    source_ref: &str,
    author: &AuthUser,
    worktree: &PathBuf,
) -> ApiResult<()> {
    run_git_worktree_command(
        repo,
        worktree,
        &[
            "checkout".to_string(),
            "-f".to_string(),
            target_branch.to_string(),
        ],
    )
    .await?;
    let mut command = Command::new("git");
    command
        .arg("--git-dir")
        .arg(&repo.local_path)
        .arg("--work-tree")
        .arg(worktree)
        .arg("merge")
        .arg("--no-edit")
        .arg(source_ref)
        .env("GIT_AUTHOR_NAME", &author.username)
        .env(
            "GIT_AUTHOR_EMAIL",
            format!("{}@diggit.local", author.username),
        )
        .env("GIT_COMMITTER_NAME", &author.username)
        .env(
            "GIT_COMMITTER_EMAIL",
            format!("{}@diggit.local", author.username),
        );
    let output = command.output().await?;
    if !output.status.success() {
        return Err(ApiError::BadRequest(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(())
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
        .env(
            "GIT_AUTHOR_EMAIL",
            format!("{}@diggit.local", author.username),
        )
        .env("GIT_COMMITTER_NAME", &author.username)
        .env(
            "GIT_COMMITTER_EMAIL",
            format!("{}@diggit.local", author.username),
        );
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
    ensure_output_size(&output.stdout)?;
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
    if output.stdout.len() > MAX_RAW_FILE_BYTES as usize {
        return Err(ApiError::BadRequest(
            "file is too large to download".to_string(),
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
    timeout_command(command).await
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
    timeout_command(command).await
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum GitSshService {
    UploadPack,
    ReceivePack,
}

impl GitSshService {
    pub(crate) fn program(self) -> &'static str {
        match self {
            Self::UploadPack => "git-upload-pack",
            Self::ReceivePack => "git-receive-pack",
        }
    }
}

pub(crate) fn git_ssh_service_command(repo: &Repository, service: GitSshService) -> Command {
    let mut command = Command::new(service.program());
    command
        .arg(&repo.local_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    command
}

async fn timeout_command(mut command: Command) -> ApiResult<std::process::Output> {
    tokio::time::timeout(
        std::time::Duration::from_secs(GIT_COMMAND_TIMEOUT_SECONDS),
        command.output(),
    )
    .await
    .map_err(|_| ApiError::BadRequest("git command timed out".to_string()))?
    .map_err(ApiError::from)
}

fn ensure_output_size(output: &[u8]) -> ApiResult<()> {
    if output.len() > MAX_GIT_OUTPUT_BYTES {
        Err(ApiError::BadRequest("git output is too large".to_string()))
    } else {
        Ok(())
    }
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
        author_avatar_url: None,
        avatar_fallback: avatar_fallback(&author_name),
        author_name,
        author_email,
        author_username: None,
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
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
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

fn language_for_path(path: &str) -> Option<&'static str> {
    let name = repo_path_name(path).to_ascii_lowercase();
    match name.as_str() {
        "dockerfile" => return Some("Dockerfile"),
        "makefile" => return Some("Makefile"),
        "cmakelists.txt" => return Some("CMake"),
        _ => {}
    }

    match file_extension(path).as_deref()? {
        "astro" => Some("Astro"),
        "c" => Some("C"),
        "cc" | "cpp" | "cxx" | "hpp" | "hxx" => Some("C++"),
        "clj" | "cljs" => Some("Clojure"),
        "cs" => Some("C#"),
        "css" => Some("CSS"),
        "dart" => Some("Dart"),
        "ex" | "exs" => Some("Elixir"),
        "go" => Some("Go"),
        "h" => Some("C"),
        "html" | "htm" => Some("HTML"),
        "java" => Some("Java"),
        "js" | "mjs" | "cjs" | "jsx" => Some("JavaScript"),
        "json" => Some("JSON"),
        "kt" | "kts" => Some("Kotlin"),
        "lua" => Some("Lua"),
        "php" => Some("PHP"),
        "pl" | "pm" => Some("Perl"),
        "py" | "pyw" => Some("Python"),
        "r" => Some("R"),
        "rb" => Some("Ruby"),
        "rs" => Some("Rust"),
        "sass" | "scss" => Some("SCSS"),
        "scala" => Some("Scala"),
        "sh" | "bash" | "zsh" | "fish" => Some("Shell"),
        "sql" => Some("SQL"),
        "svelte" => Some("Svelte"),
        "swift" => Some("Swift"),
        "toml" => Some("TOML"),
        "ts" | "tsx" | "mts" | "cts" => Some("TypeScript"),
        "vue" => Some("Vue"),
        "yaml" | "yml" => Some("YAML"),
        _ => None,
    }
}

fn language_color(language: &str) -> &'static str {
    match language {
        "Astro" => "#ff5d01",
        "C" => "#555555",
        "C#" => "#178600",
        "C++" => "#f34b7d",
        "Clojure" => "#db5855",
        "CMake" => "#da3434",
        "CSS" => "#563d7c",
        "Dart" => "#00b4ab",
        "Dockerfile" => "#384d54",
        "Elixir" => "#6e4a7e",
        "Go" => "#00add8",
        "HTML" => "#e34c26",
        "Java" => "#b07219",
        "JavaScript" => "#f1e05a",
        "JSON" => "#292929",
        "Kotlin" => "#a97bff",
        "Lua" => "#000080",
        "Makefile" => "#427819",
        "PHP" => "#4f5d95",
        "Perl" => "#0298c3",
        "Python" => "#3572a5",
        "R" => "#198ce7",
        "Ruby" => "#701516",
        "Rust" => "#dea584",
        "SCSS" => "#c6538c",
        "SQL" => "#e38c00",
        "Scala" => "#c22d40",
        "Shell" => "#89e051",
        "Svelte" => "#ff3e00",
        "Swift" => "#f05138",
        "TOML" => "#9c4221",
        "TypeScript" => "#3178c6",
        "Vue" => "#41b883",
        "YAML" => "#cb171e",
        _ => "#858585",
    }
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

    #[test]
    fn trims_only_git_diff_prefix_from_paths() {
        assert_eq!(trim_git_path("a/src/main.ts"), "src/main.ts");
        assert_eq!(trim_git_path("b/a/nested.ts"), "a/nested.ts");
    }

    #[test]
    fn parses_branch_refs() {
        let branch = parse_branch_line("feature/test\0abc123", "main").unwrap();
        assert_eq!(branch.name, "feature/test");
        assert!(!branch.is_default);
        assert_eq!(branch.commit_sha.as_deref(), Some("abc123"));

        let default_branch = parse_branch_line("main\0def456", "main").unwrap();
        assert!(default_branch.is_default);
    }
}
