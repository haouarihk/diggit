import { component$ } from "@builder.io/qwik";
import {
  type DocumentHead,
  routeLoader$,
  useLocation,
} from "@builder.io/qwik-city";
import {
  getRepository,
  listRepositoryBranches,
  publicApiBaseUrl,
} from "~/lib/api";

export const useRepositoryRoute = routeLoader$(async ({ params }) => {
  const repository = await getRepository(params.owner, params.name).catch(() => null);
  const branches = repository
    ? await listRepositoryBranches(params.owner, params.name).catch(() => ({
        data: [],
      }))
    : { data: [] };

  return {
    branches: branches.data,
    repository,
  };
});

export default component$(() => {
  const route = useRepositoryRoute();
  const location = useLocation();

  if (!route.value.repository) {
    return (
      <section className="panel stack">
        <span className="eyebrow">Representative route: Repository detail</span>
        <h1>Repository not found</h1>
        <p className="muted">
          The backend did not return a repository for this route.
        </p>
      </section>
    );
  }

  const repository = route.value.repository;

  return (
    <div className="stack">
      <section className="hero stack">
        <span className="eyebrow">Representative route: Repository detail</span>
        <h1>
          {repository.owner_handle}/{repository.name}
        </h1>
        <p className="muted">
          {repository.description || "No repository description provided."}
        </p>
        <div className="muted">
          <span>{repository.visibility}</span> ·{" "}
          <span>{repository.default_branch}</span> ·{" "}
          <span>{repository.stars_count} stars</span>
        </div>
      </section>

      <section className="panel stack">
        <strong>Clone URLs</strong>
        <span className="muted">{repository.http_url}</span>
        <span className="muted">{repository.ssh_url}</span>
      </section>

      <section className="list-panel">
        <div className="list-panel__header">Branches</div>
        {route.value.branches.length === 0 ? (
          <div className="list-panel__item muted">
            No branches were returned by the backend.
          </div>
        ) : (
          route.value.branches.map((branch) => (
            <article className="list-panel__item stack" key={branch.name}>
              <strong>{branch.name}</strong>
              <span className="muted">
                {branch.is_default ? "Default branch" : "Branch"} ·{" "}
                {branch.commit_sha ?? "No commit yet"}
              </span>
            </article>
          ))
        )}
      </section>

      <section className="panel stack">
        <strong>Route metadata</strong>
        <span className="muted">Current path: {location.url.pathname}</span>
        <span className="muted">
          Public API base: {publicApiBaseUrl()}
        </span>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Repository · Diggit Qwik Prototype",
};
