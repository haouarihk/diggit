ALTER TABLE repositories
ADD COLUMN IF NOT EXISTS dominant_language TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN IF NOT EXISTS stars_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS repository_stars (
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, user_id)
);
