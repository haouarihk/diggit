CREATE TABLE IF NOT EXISTS release_reactions (
  release_id UUID NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  actor_display_name TEXT NOT NULL,
  remote_server TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, actor_url, emoji)
);

CREATE INDEX IF NOT EXISTS release_reactions_release_emoji_idx
ON release_reactions (release_id, emoji);
