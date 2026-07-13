import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead, routeLoader$ } from "@builder.io/qwik-city";
import { listRepositories } from "~/lib/api";

export const useRepositories = routeLoader$(async () => {
  return listRepositories().catch(() => ({ data: [] }));
});

export default component$(() => {
  const repositories = useRepositories();

  return (
    <div class="stack">
      <section class="hero stack">
        <span class="eyebrow">Representative route: Home</span>
        <h1>Repositories</h1>
        <p class="muted">
          This Qwik page uses a server loader against the Rust backend&apos;s
          `/repos` contract with no Next.js proxy layer in between.
        </p>
      </section>

      <section class="list-panel">
        <div class="list-panel__header">Repository discovery</div>
        {repositories.value.data.length === 0 ? (
          <div class="list-panel__item muted">
            No repositories were returned by the backend.
          </div>
        ) : (
          repositories.value.data.map((repo) => (
            <article
              class="list-panel__item stack"
              key={`${repo.owner_handle}/${repo.name}`}
            >
              <div class="grid">
                <Link
                  href={`/${encodeURIComponent(repo.owner_handle)}/${encodeURIComponent(repo.name)}`}
                >
                  <strong>
                    {repo.owner_handle}/{repo.name}
                  </strong>
                </Link>
                <span class="muted">
                  {repo.description || "No description provided."}
                </span>
              </div>
              <div class="muted">
                <span>{repo.visibility}</span> ·{" "}
                <span>{repo.default_branch}</span> ·{" "}
                <span>{repo.stars_count} stars</span>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repositories · Diggit Qwik Prototype",
  meta: [
    {
      name: "description",
      content: "Repository listing rendered by the Diggit Qwik prototype.",
    },
  ],
};
