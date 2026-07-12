import { CodeDiff } from "@/components/CodeDiff";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { compareRefs, getRepository, listPullRequests, type RepositoryCommit } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
    range: string;
  }>;
};

export default async function CompareTagsPage({ params }: Props) {
  const { owner, name, range } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const decodedRange = decodeURIComponent(range);
  const [base = "", head = ""] = decodedRange.split("...");
  const [repo, pullRequests, compare] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
    compareRefs(decodedOwner, decodedName, decodedRange),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
          <div>
            <h2 className="text-xl font-semibold">Compare tags</h2>
            <p className="text-[#59636e]">
              Comparing <RefBadge>{base}</RefBadge> to <RefBadge>{head}</RefBadge>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
            <span>{compare.ahead_by} commits ahead</span>
            <span>{compare.behind_by} commits behind</span>
            <span className="rounded-full border border-[#d0d7de] px-2 py-0.5">{compare.status.replaceAll("_", " ")}</span>
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-2">
          <CommitList commits={compare.ahead_commits} emptyLabel="No commits ahead." title="Ahead commits" />
          <CommitList commits={compare.behind_commits} emptyLabel="No commits behind." title="Behind commits" />
        </div>
        <CodeDiff emptyLabel="No diff to show between these tags." files={compare.files} />
      </RepoPageContent>
    </div>
  );
}

function RefBadge({ children }: { children: string }) {
  return <span className="rounded-md bg-[#ddf4ff] px-1.5 py-0.5 font-mono text-xs text-[#0969da]">{children}</span>;
}

function CommitList({ commits, emptyLabel, title }: { commits: RepositoryCommit[]; emptyLabel: string; title: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
      <header className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
      </header>
      {commits.length === 0 ? (
        <p className="p-4 text-sm text-[#59636e]">{emptyLabel}</p>
      ) : (
        commits.map((commit) => (
          <article className="grid gap-1 border-b border-[#d8dee4] p-4 last:border-b-0" key={commit.sha}>
            <div className="font-semibold">{commit.message}</div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#59636e]">
              <span>{commit.author_name}</span>
              <span>{formatDate(commit.created_at)}</span>
              <span className="font-mono text-xs">{commit.sha.slice(0, 12)}</span>
            </div>
          </article>
        ))
      )}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
