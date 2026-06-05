CREATE TABLE IF NOT EXISTS issue_labels (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#59636e',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(repository_id, lower(name))
);

CREATE TABLE IF NOT EXISTS issue_label_assignments (
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES issue_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX IF NOT EXISTS issue_label_assignments_label_idx
ON issue_label_assignments (label_id, issue_id);
