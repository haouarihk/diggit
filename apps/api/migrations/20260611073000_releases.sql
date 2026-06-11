CREATE TABLE IF NOT EXISTS releases (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  target_commit_sha TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  author_actor_url TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
  is_prerelease BOOLEAN NOT NULL DEFAULT FALSE,
  activity_id TEXT UNIQUE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repository_id, tag_name)
);

CREATE INDEX IF NOT EXISTS releases_repository_published_idx
ON releases (repository_id, published_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS release_assets (
  id UUID PRIMARY KEY,
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  uploaded_by_actor_url TEXT NOT NULL,
  runner_id UUID REFERENCES runners(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  download_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS release_assets_release_idx
ON release_assets (release_id, created_at)
WHERE deleted_at IS NULL;
