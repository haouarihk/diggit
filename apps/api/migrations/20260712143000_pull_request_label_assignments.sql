CREATE TABLE IF NOT EXISTS pull_request_label_assignments (
  pull_request_id BIGINT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES issue_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pull_request_id, label_id)
);

CREATE INDEX IF NOT EXISTS pull_request_label_assignments_label_idx
ON pull_request_label_assignments (label_id, pull_request_id);
