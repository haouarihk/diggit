import { NewRepositoryButton } from "@/components/NewRepositoryButton";
import { RepositoryList } from "@/components/RepositoryList";
import { getUser, listUserRepositories } from "@/lib/api";

type UserProfilePageProps = {
  params: Promise<{
    username: string;
  }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    direction?: string;
  }>;
};

export default async function UserProfilePage({ params, searchParams }: UserProfilePageProps) {
  const { username } = await params;
  const filters = await searchParams;
  const [user, repos] = await Promise.all([
    getUser(username),
    listUserRepositories(username, filters).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="grid gap-4 self-start">
        <section className="rounded-md border border-[#d0d7de] bg-white p-4">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="mb-4 h-32 w-32 rounded-full bg-[#d0d7de]" src={user.avatar_url} />
          ) : (
            <span className="mb-4 inline-flex h-32 w-32 items-center justify-center rounded-full bg-[#d0d7de] text-4xl font-bold">
              {user.avatar_fallback}
            </span>
          )}
          <h1 className="text-2xl font-semibold">{user.display_name}</h1>
          <p className="text-[#59636e]">@{user.username}</p>
        </section>
      </aside>

      <main className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Repositories</h2>
          <NewRepositoryButton owner={user.username} ownerUserId={user.id} />
        </div>
        <RepoFilters q={filters.q} sort={filters.sort} direction={filters.direction} />
        <RepositoryList emptyLabel="No repositories matched this profile." repositories={repos.data} />
      </main>
    </div>
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
