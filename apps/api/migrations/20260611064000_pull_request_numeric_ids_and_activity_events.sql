CREATE SEQUENCE IF NOT EXISTS pull_requests_id_seq AS BIGINT;

ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS numeric_id BIGINT;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id)::BIGINT AS next_id
  FROM pull_requests
  WHERE numeric_id IS NULL
)
UPDATE pull_requests
SET numeric_id = numbered.next_id
FROM numbered
WHERE pull_requests.id = numbered.id;

SELECT setval(
  'pull_requests_id_seq',
  GREATEST((SELECT COALESCE(MAX(numeric_id), 0) FROM pull_requests), 1),
  (SELECT COALESCE(MAX(numeric_id), 0) > 0 FROM pull_requests)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pull_requests'
      AND column_name = 'id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_pull_request_id_fkey;
    ALTER TABLE pull_requests DROP CONSTRAINT IF EXISTS pull_requests_pkey;

    ALTER TABLE comments RENAME COLUMN pull_request_id TO pull_request_uuid;
    ALTER TABLE comments ADD COLUMN pull_request_id BIGINT;

    UPDATE comments
    SET pull_request_id = pull_requests.numeric_id
    FROM pull_requests
    WHERE comments.pull_request_uuid = pull_requests.id;

    ALTER TABLE pull_requests RENAME COLUMN id TO legacy_uuid;
    ALTER TABLE pull_requests RENAME COLUMN numeric_id TO id;
    ALTER TABLE pull_requests ALTER COLUMN id SET NOT NULL;
    ALTER TABLE pull_requests ALTER COLUMN id SET DEFAULT nextval('pull_requests_id_seq');
    ALTER SEQUENCE pull_requests_id_seq OWNED BY pull_requests.id;
    ALTER TABLE pull_requests ADD CONSTRAINT pull_requests_pkey PRIMARY KEY (id);
    ALTER TABLE comments ADD CONSTRAINT comments_pull_request_id_fkey
      FOREIGN KEY (pull_request_id) REFERENCES pull_requests(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_pull_request_id ON comments(pull_request_id);

CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES issues(id) ON DELETE CASCADE,
  pull_request_id BIGINT REFERENCES pull_requests(id) ON DELETE CASCADE,
  actor_handle TEXT NOT NULL,
  actor_actor_url TEXT,
  actor_display_name TEXT NOT NULL,
  actor_avatar_url TEXT,
  remote_server TEXT,
  event_type TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (issue_id IS NOT NULL AND pull_request_id IS NULL)
    OR (issue_id IS NULL AND pull_request_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_issue ON timeline_events(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_timeline_events_pull_request ON timeline_events(pull_request_id, created_at);
