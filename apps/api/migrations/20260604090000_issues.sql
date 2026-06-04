CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_handle TEXT NOT NULL,
  author_actor_url TEXT,
  author_display_name TEXT NOT NULL DEFAULT '',
  author_avatar_url TEXT,
  remote_server TEXT,
  remote_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  activity_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repository_id, number)
);

CREATE INDEX IF NOT EXISTS issues_repository_status_created_idx
ON issues (repository_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS issues_remote_url_idx
ON issues (remote_url)
WHERE remote_url IS NOT NULL;

ALTER TABLE comments
ADD COLUMN IF NOT EXISTS issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS author_actor_url TEXT,
ADD COLUMN IF NOT EXISTS author_display_name TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS author_avatar_url TEXT,
ADD COLUMN IF NOT EXISTS remote_server TEXT;

CREATE INDEX IF NOT EXISTS comments_issue_created_idx
ON comments (issue_id, created_at);

ALTER TABLE comments
ADD CONSTRAINT comments_target_present
CHECK (repository_id IS NOT NULL OR pull_request_id IS NOT NULL OR issue_id IS NOT NULL)
NOT VALID;
