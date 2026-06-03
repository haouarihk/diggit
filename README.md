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

## License

Diggit is licensed under the [MIT License](LICENSE).
