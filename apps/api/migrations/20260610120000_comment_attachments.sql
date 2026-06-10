CREATE TABLE IF NOT EXISTS comment_attachments (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  uploaded_by_actor_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attached_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS comment_attachments_repository_idx
ON comment_attachments (repository_id, created_at);

CREATE INDEX IF NOT EXISTS comment_attachments_comment_idx
ON comment_attachments (comment_id, created_at)
WHERE comment_id IS NOT NULL;
