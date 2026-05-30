# Federation MVP

Diggit models local users as ActivityPub actors. A user handle is represented as `username@server`, and remote activities are accepted only after server policy checks.

## Supported Discovery

- `GET /.well-known/webfinger?resource=acct:alice@example.com`
- `GET /actors/:username`

## Supported Activities

- `Create` with a `RepositoryFork` object records that a repo was forked on another server.
- `Offer` with a `PullRequest` object records a cross-server pull request.
- `Create` with a `Note` object records federated comments.

## Moderation

Each remote server is tracked in the `servers` table. Servers can be `allowed`, `blocked`, or `pending`. Blocked servers cannot create inbound activities.
