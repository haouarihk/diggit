import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { Link } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div class="admin-page">
      <section class="admin-page__hero">
        <p class="admin-page__eyebrow">Server administration</p>
        <h1 class="admin-page__title">Admin</h1>
        <p class="admin-page__description">
          Manage federation policy and inspect server-to-server activity from
          one place.
        </p>
      </section>

      <section class="admin-page__grid">
        <Link class="admin-page__card" href="/admin/servers">
          <strong>Federated servers</strong>
          <span class="admin-page__card-copy">
            Whitelist, blacklist, and review known remote hosts.
          </span>
        </Link>
        <Link class="admin-page__card" href="/admin/activity">
          <strong>Activity log</strong>
          <span class="admin-page__card-copy">
            Inspect inbound and outbound ActivityPub messages.
          </span>
        </Link>
        <Link class="admin-page__card" href="/admin/runners">
          <strong>Server runners</strong>
          <span class="admin-page__card-copy">
            Manage server-scope Gitea-compatible runners.
          </span>
        </Link>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Admin · Diggit",
};
