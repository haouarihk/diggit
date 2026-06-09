CREATE TABLE IF NOT EXISTS oauth_applications (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  client_secret_hash TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_applications_owner_id_idx
  ON oauth_applications(owner_id);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_authorization_codes_application_id_idx
  ON oauth_authorization_codes(application_id);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_access_tokens_application_id_idx
  ON oauth_access_tokens(application_id);

CREATE INDEX IF NOT EXISTS oauth_access_tokens_user_id_idx
  ON oauth_access_tokens(user_id);

CREATE TABLE IF NOT EXISTS gitlab_project_mappings (
  gitlab_project_id BIGSERIAL PRIMARY KEY,
  repository_id UUID NOT NULL UNIQUE REFERENCES repositories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS repository_webhooks (
  id UUID PRIMARY KEY,
  repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT ARRAY['push'],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_status TEXT,
  last_status_code INTEGER,
  last_error TEXT,
  last_delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repository_webhooks_repository_id_idx
  ON repository_webhooks(repository_id);
