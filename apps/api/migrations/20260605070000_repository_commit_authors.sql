CREATE TABLE IF NOT EXISTS repository_commit_authors (
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS repository_commit_authors_user_id_idx
  ON repository_commit_authors(user_id);
