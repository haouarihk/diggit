# Diggit
> **⚠️ This project is under heavy development. Features, APIs, and behavior may change at any time. Use with caution and expect breaking changes.**

Diggit is a federated Git hosting MVP. It uses a Next.js web app, a Rust API, local bare Git repositories, and ActivityPub-inspired server-to-server messages for cross-host forks and pull requests.

## Apps

- `apps/web`: Next.js frontend.
- `apps/api`: Rust API and federation service.
- `docs`: federation notes and API conventions.

## Local Development

1. Copy `.env.example` to `.env` and adjust secrets.
2. Start Postgres with `docker compose up -d`.
3. Run the API with `cargo run --manifest-path apps/api/Cargo.toml`.
4. Run the web app with `pnpm install` then `pnpm dev`.

The API listens on `http://localhost:3001` by default. The Rust backend now owns the public API, OAuth, social preview, and Git smart-HTTP endpoints, while `apps/web` is only the UI layer. For Docker deployments, set `APP_BASE_URL` to the browser-facing backend URL, `API_INTERNAL_URL` to the API service URL that the web container can reach, and `PUBLIC_API_URL` to the browser-facing API URL used by the web app.

## Run From GHCR Images
```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: diggit
      POSTGRES_USER: diggit
      POSTGRES_PASSWORD: diggit
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data

  api:
    image: ghcr.io/haouarihk/diggit-api:main
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgres://diggit:diggit@postgres:5432/diggit
      REDIS_URL: redis://redis:6379
      # Public backend URL for API, OAuth, social previews, and Git smart-HTTP.
      APP_BASE_URL: http://localhost:3001
      # Public web UI URL.
      PUBLIC_WEB_URL: http://localhost:3000
      GIT_STORAGE_PATH: /data/git
      JWT_SECRET: replace-with-at-least-32-random-characters
      ADMIN_USERNAMES: alice
      SIGNUPS_ENABLED: "true"
      SSH_HOST: 0.0.0.0 # bind address
      SSH_HOST_KEY_PATH: /data/git/ssh_host_ed25519_key
      SSH_PORT: "2222" # *
      PORT: "3001"
    ports:
      - "3001:3001"
      # ssh port (make sure to change it in all 3 places. so that the frontend knows what port to deliver to the client. copy link feature)
      - "2222:2222"
    volumes:
      - git_data:/data/git

  web:
    image: ghcr.io/haouarihk/diggit-web:main
    depends_on:
      - api
    environment:
      # Used by server-rendered pages inside Docker.
      API_INTERNAL_URL: http://api:3001
      # Used by browser-side requests and rendered asset URLs.
      PUBLIC_API_URL: http://localhost:3001
      PORT: "3000"
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  redis_data:
  git_data:
```

Save this as `compose.yml`, then run `docker compose up -d`.
Clone over SSH with `git clone ssh://git@localhost:2222/OWNER/REPO.git` after adding your public key in Diggit. HTTP clone URLs and Git smart-HTTP traffic now come from `APP_BASE_URL`, while repository pages still live under `PUBLIC_WEB_URL`. `SSH_HOST` only controls which address the SSH server binds to.

## License

Diggit is licensed under the [MIT License](LICENSE).
