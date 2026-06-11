CREATE TABLE IF NOT EXISTS reactions (
  id UUID PRIMARY KEY,
  comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  actor_display_name TEXT NOT NULL,
  remote_server TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (CASE WHEN comment_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN release_id IS NULL THEN 0 ELSE 1 END) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS reactions_comment_actor_emoji_idx
ON reactions (comment_id, actor_url, emoji)
WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reactions_release_actor_emoji_idx
ON reactions (release_id, actor_url, emoji)
WHERE release_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reactions_comment_emoji_idx
ON reactions (comment_id, emoji)
WHERE comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reactions_release_emoji_idx
ON reactions (release_id, emoji)
WHERE release_id IS NOT NULL;

INSERT INTO reactions (
  id,
  comment_id,
  emoji,
  actor_url,
  actor_display_name,
  remote_server,
  created_at
)
SELECT
  md5('comment:' || comment_id::text || ':' || actor_url || ':' || emoji)::uuid,
  comment_id,
  emoji,
  actor_url,
  actor_display_name,
  remote_server,
  created_at
FROM comment_reactions
ON CONFLICT DO NOTHING;

INSERT INTO reactions (
  id,
  release_id,
  emoji,
  actor_url,
  actor_display_name,
  remote_server,
  created_at
)
SELECT
  md5('release:' || release_id::text || ':' || actor_url || ':' || emoji)::uuid,
  release_id,
  emoji,
  actor_url,
  actor_display_name,
  remote_server,
  created_at
FROM release_reactions
ON CONFLICT DO NOTHING;
