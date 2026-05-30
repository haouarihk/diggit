import { RepositoryList } from "@/components/RepositoryList";
import { listRepositories } from "@/lib/api";

type HomeProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { q } = await searchParams;
  const query = q?.trim().toLowerCase() ?? "";
  const repos = await listRepositories().catch(() => ({ data: [] }));
  const visibleRepos = query
    ? repos.data.filter((repo) => {
        const haystack = [
          repo.owner_handle,
          repo.owner?.display_name ?? repo.owner_handle,
          repo.name,
          repo.description,
          repo.visibility,
          repo.remote_server ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : repos.data;

  return (
    <div className="grid gap-4">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">Federated Git hosting</p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Repositories</h1>
        <p className="text-[#59636e]">
          Discover local and federated repositories, create projects, and fork across servers.
        </p>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-md border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-semibold">
            <span>Repository discovery</span>
            {query ? <span className="text-sm font-normal text-[#59636e]">Filtering by “{q}”</span> : null}
          </div>
          <RepositoryList
            emptyLabel={query ? "No repositories matched your search." : "No repositories yet."}
            repositories={visibleRepos}
          />
        </section>

        <aside className="grid gap-3.5">
          <section className="grid gap-3.5 rounded-md border border-[#d0d7de] bg-white p-4">
            <h2>Federation</h2>
            <p className="text-[#59636e]">
              Forks and pull requests can move server-to-server while repositories stay owned by
              their local namespace.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
