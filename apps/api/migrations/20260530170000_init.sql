CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT NOT NULL,
  actor_url TEXT NOT NULL UNIQUE,
  inbox_url TEXT NOT NULL,
  outbox_url TEXT NOT NULL,
  public_key_pem TEXT,
  private_key_pem TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ssh_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  public_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE namespaces (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'organization')),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'user' AND user_id IS NOT NULL AND organization_id IS NULL)
    OR
    (kind = 'organization' AND organization_id IS NOT NULL AND user_id IS NULL)
  )
);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE servers (
  id UUID PRIMARY KEY,
  host TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('allowed', 'blocked', 'pending')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE repositories (
  id UUID PRIMARY KEY,
  namespace_id UUID REFERENCES namespaces(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_handle TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  default_branch TEXT NOT NULL DEFAULT 'main',
  local_path TEXT NOT NULL,
  remote_url TEXT,
  remote_server TEXT,
  source_repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  source_remote_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_handle, name)
);

CREATE TABLE repository_forks (
  id UUID PRIMARY KEY,
  source_repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  fork_repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  source_server TEXT NOT NULL,
  fork_server TEXT NOT NULL,
  remote_actor TEXT NOT NULL,
  activity_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pull_requests (
  id UUID PRIMARY KEY,
  target_repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  source_repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  author_handle TEXT NOT NULL,
  source_repo_url TEXT NOT NULL,
  source_branch TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'merged')),
  activity_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id UUID PRIMARY KEY,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  pull_request_id UUID REFERENCES pull_requests(id) ON DELETE CASCADE,
  author_handle TEXT NOT NULL,
  body TEXT NOT NULL,
  activity_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id UUID PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  remote_server TEXT,
  actor TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  object_type TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runner_registration_tokens (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('server', 'user', 'organization', 'repository')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runners (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('server', 'user', 'organization', 'repository')),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  labels TEXT[] NOT NULL DEFAULT '{}',
  version TEXT,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline', 'disabled')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runner_tasks (
  id UUID PRIMARY KEY,
  runner_id UUID REFERENCES runners(id) ON DELETE SET NULL,
  repository_id UUID REFERENCES repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
