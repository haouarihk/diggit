import Link from "next/link";
import { RepositoryList } from "@/components/RepositoryList";
import { search } from "@/lib/api";

const FILTERS = [
  { id: "code", label: "Code", enabled: false },
  { id: "repositories", label: "Repositories", enabled: true },
  { id: "issues", label: "Issues", enabled: false },
  { id: "pull-requests", label: "Pull requests", enabled: false },
  { id: "discussions", label: "Discussions", enabled: false },
  { id: "users", label: "Users", enabled: true },
];

type SearchPageProps = {
  searchParams: Promise<{
    q?: string;
    type?: string;
  }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q = "", type = "repositories" } = await searchParams;
  const activeType = FILTERS.some((filter) => filter.id === type) ? type : "repositories";
  const results = await search(q, activeType).catch(() => null);

  return (
    <div className="grid gap-6">
      <section>
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Federated search
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Search</h1>
        <p className="text-[#59636e]">
          Search repositories and users across local records and known federated repository records.
        </p>
      </section>

      <form className="flex flex-col gap-3 rounded-md border border-[#d0d7de] bg-white p-4 md:flex-row" action="/search">
        <input
          className="min-w-0 flex-1 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-base"
          defaultValue={q}
          name="q"
          placeholder={'repo:owner/name user:alice "exact phrase" NOT fork'}
          type="search"
        />
        <input name="type" type="hidden" value={activeType} />
        <button className="rounded-md border border-black/15 bg-[#1a7f37] px-4 py-2 font-bold text-white" type="submit">
          Search
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-md border border-[#d0d7de] bg-white p-2">
          {FILTERS.map((filter) => (
            <Link
              aria-disabled={!filter.enabled}
              className={`flex items-center justify-between rounded-md px-3 py-2 font-semibold ${
                activeType === filter.id
                  ? "bg-[#0969da] text-white"
                  : filter.enabled
                    ? "text-[#1f2328] hover:bg-[#f6f8fa]"
                    : "pointer-events-none text-[#8c959f]"
              }`}
              href={filter.enabled ? `/search?q=${encodeURIComponent(q)}&type=${filter.id}` : "#"}
              key={filter.id}
            >
              <span>{filter.label}</span>
              {!filter.enabled ? <span className="text-xs">soon</span> : null}
            </Link>
          ))}
        </aside>

        <main className="grid gap-4">
          {activeType === "code" ? <CodeSearchSyntax /> : null}
          {results ? (
            <>
              <section className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">
                <p>{results.federated.description}</p>
                {results.parsed.unsupported_qualifiers.length > 0 ? (
                  <p className="mt-2">
                    Parsed but not indexed yet: {results.parsed.unsupported_qualifiers.join(", ")}
                  </p>
                ) : null}
              </section>

              {activeType === "users" ? (
                <UserResults users={results.data.users} />
              ) : (
                <RepositoryList emptyLabel="No repositories matched your search." repositories={results.data.repositories} />
              )}
            </>
          ) : (
            <section className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">
              Search is unavailable right now.
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function UserResults({ users }: { users: NonNullable<Awaited<ReturnType<typeof search>>>["data"]["users"] }) {
  if (users.length === 0) {
    return <EmptyState label="No users matched your search." />;
  }

  return (
    <section className="rounded-md border border-[#d0d7de] bg-white">
      <div className="border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 font-semibold">User results</div>
      <div className="grid">
        {users.map((user) => (
          <article className="flex items-center gap-3 border-b border-[#d8dee4] p-4 last:border-b-0" key={user.id}>
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" className="h-10 w-10 rounded-full bg-[#d0d7de]" src={user.avatar_url} />
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#d0d7de] font-bold">
                {user.avatar_fallback}
              </span>
            )}
            <div>
              <Link className="font-semibold text-[#0969da] hover:underline" href={`/users/${encodeURIComponent(user.username)}`}>
                {user.username}
              </Link>
              <p className="text-[#59636e]">{user.display_name}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return <section className="rounded-md border border-[#d0d7de] bg-white p-4 text-[#59636e]">{label}</section>;
}

function CodeSearchSyntax() {
  return (
    <section className="rounded-md border border-[#d0d7de] bg-white p-4">
      <h2 className="mb-3 text-lg font-semibold">GitHub-style code search syntax</h2>
      <div className="grid gap-3 text-[#59636e]">
        <p>Code indexing is not enabled yet, but the search grammar is reserved for these features.</p>
        <ul className="list-disc pl-5">
          <li>Bare terms search content or path, and whitespace means `AND`.</li>
          <li>Use quotes for exact strings, like &quot;sparse index&quot;.</li>
          <li>Use boolean operators: `AND`, `OR`, `NOT`, plus parentheses.</li>
          <li>Use qualifiers like `repo:owner/name`, `user:alice`, `org:acme`, `language:rust`, `path:src/**/*.ts`, `symbol:WithContext`.</li>
          <li>Use regex terms surrounded by slashes, like `/sparse.*index/`.</li>
        </ul>
      </div>
    </section>
  );
}
