ALTER TABLE comments
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS comments_pull_request_created_idx
ON comments (pull_request_id, created_at);

CREATE TABLE IF NOT EXISTS comment_reactions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  actor_display_name TEXT NOT NULL DEFAULT '',
  remote_server TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, actor_url, emoji)
);

CREATE INDEX IF NOT EXISTS comment_reactions_comment_emoji_idx
ON comment_reactions (comment_id, emoji);
