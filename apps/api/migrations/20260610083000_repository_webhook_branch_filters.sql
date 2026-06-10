ALTER TABLE repository_webhooks
  ADD COLUMN IF NOT EXISTS push_events_branch_filter TEXT,
  ADD COLUMN IF NOT EXISTS branch_filter_strategy TEXT;
