import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { apiFetch, type PullRequest, type Repository } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function RepositoryIssuesPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests] = await Promise.all([
    apiFetch<Repository>(baseHref),
    apiFetch<{ data: PullRequest[] }>(`${baseHref}/pull-requests`).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="issues" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <section className="rounded-md border border-[#d0d7de] bg-white p-6 text-center">
        <h2 className="text-lg font-semibold">Issues are not available yet</h2>
        <p className="mt-2 text-[#59636e]">This page is ready for repository issue tracking when the API supports it.</p>
      </section>
    </div>
  );
}
