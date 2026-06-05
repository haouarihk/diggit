ALTER TABLE repositories
ADD COLUMN IF NOT EXISTS issues_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS pull_requests_enabled BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS pull_request_policy TEXT NOT NULL DEFAULT 'anyone',
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE repositories
DROP CONSTRAINT IF EXISTS repositories_pull_request_policy_check;

ALTER TABLE repositories
ADD CONSTRAINT repositories_pull_request_policy_check
CHECK (pull_request_policy IN ('anyone', 'collaborators'));

CREATE TABLE IF NOT EXISTS runner_secrets (
  id UUID PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('organization', 'repository')),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  environment TEXT,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope_kind = 'organization' AND organization_id IS NOT NULL AND repository_id IS NULL)
    OR
    (scope_kind = 'repository' AND repository_id IS NOT NULL AND organization_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS runner_secrets_repository_unique_idx
ON runner_secrets (repository_id, COALESCE(environment, ''), lower(name))
WHERE repository_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS runner_secrets_organization_unique_idx
ON runner_secrets (organization_id, COALESCE(environment, ''), lower(name))
WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS runner_variables (
  id UUID PRIMARY KEY,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('organization', 'repository')),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  environment TEXT,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (scope_kind = 'organization' AND organization_id IS NOT NULL AND repository_id IS NULL)
    OR
    (scope_kind = 'repository' AND repository_id IS NOT NULL AND organization_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS runner_variables_repository_unique_idx
ON runner_variables (repository_id, COALESCE(environment, ''), lower(name))
WHERE repository_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS runner_variables_organization_unique_idx
ON runner_variables (organization_id, COALESCE(environment, ''), lower(name))
WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS repository_collaborators (
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('read', 'write', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (repository_id, user_id)
);
