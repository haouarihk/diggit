import { Slot, component$ } from "@builder.io/qwik";
import {
  type DocumentHead,
  type RequestHandler,
  useLocation,
} from "@builder.io/qwik-city";
import { NavBar } from "~/components/navigation/NavBar";
import { maybeProxyCompatRequest } from "~/lib/compat-proxy";
import { isRepositoryPath } from "~/lib/routes";

export const onRequest: RequestHandler = async ({ next, request, send, url }) => {
  const response = await maybeProxyCompatRequest(url, request);
  if (response) {
    send(response);
    return;
  }

  await next();
};

export default component$(() => {
  const location = useLocation();
  const repositoryPage = isRepositoryPath(location.url.pathname);

  return (
    <main class="app-shell">
      <NavBar />
      {repositoryPage ? (
        <Slot />
      ) : (
        <div class="page-shell">
          <Slot />
        </div>
      )}
    </main>
  );
});

export const head: DocumentHead = {
  title: "Diggit",
  meta: [
    {
      content: "Federated Git hosting for cross-server forks and pull requests.",
      name: "description",
    },
  ],
};
