import { NewRepositoryButton } from "@/components/NewRepositoryButton";
import { RepositoryList } from "@/components/RepositoryList";
import { getOrganization, listOrganizationRepositories } from "@/lib/api";

type OrganizationRepositoriesPageProps = {
  params: Promise<{
    org: string;
  }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    direction?: string;
  }>;
};

export default async function OrganizationRepositoriesPage({ params, searchParams }: OrganizationRepositoriesPageProps) {
  const { org } = await params;
  const filters = await searchParams;
  const [organization, repos] = await Promise.all([
    getOrganization(org),
    listOrganizationRepositories(org, filters).catch(() => ({ data: [] })),
  ]);

  return (
    <main className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Repositories</h2>
        <NewRepositoryButton owner={organization.name} organizationCreatorId={organization.created_by} />
      </div>
      <RepoFilters q={filters.q} sort={filters.sort} direction={filters.direction} />
      <RepositoryList emptyLabel="No repositories matched this organization." repositories={repos.data} />
    </main>
  );
}

function RepoFilters({ q = "", sort = "updated", direction = "desc" }: { q?: string; sort?: string; direction?: string }) {
  return (
    <form className="flex flex-col gap-3 rounded-md border border-[#d0d7de] bg-white p-3 md:flex-row">
      <input className="min-w-0 flex-1 rounded-md border border-[#d0d7de] px-3 py-2" defaultValue={q} name="q" placeholder="Find a repository..." type="search" />
      <select className="rounded-md border border-[#d0d7de] px-3 py-2" defaultValue={sort} name="sort">
        <option value="updated">Last updated</option>
        <option value="stars">Stars</option>
        <option value="name">Name</option>
      </select>
      <select className="rounded-md border border-[#d0d7de] px-3 py-2" defaultValue={direction} name="direction">
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
      <button className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-2 font-semibold" type="submit">
        Filter
      </button>
    </form>
  );
}
