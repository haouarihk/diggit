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

The API listens on `http://localhost:3001` by default and the web app expects it at `NEXT_PUBLIC_API_URL`.

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
      APP_BASE_URL: http://localhost:3001
      PUBLIC_WEB_URL: http://localhost:3000
      GIT_STORAGE_PATH: /data/git
      JWT_SECRET: replace-with-at-least-32-random-characters
      ADMIN_USERNAMES: alice
      SSH_HOST: localhost
      SSH_PORT: "22"
      PORT: "3001"
    ports:
      - "3001:3001"
    volumes:
      - git_data:/data/git

  web:
    image: ghcr.io/haouarihk/diggit-web:main
    depends_on:
      - api
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      PORT: "3000"
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  redis_data:
  git_data:
```

Save this as `compose.yml`, then run `docker compose up -d`.

## License

Diggit is licensed under the [MIT License](LICENSE).
