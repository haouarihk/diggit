import Link from "next/link";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { apiFetch, type PullRequest, type Repository } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function RepositoryActionsPage({ params }: Props) {
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
      <RepoHeader activeTab="actions" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <section className="grid gap-4 rounded-md border border-[#d0d7de] bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold">Actions</h2>
          <p className="text-[#59636e]">Manage repository automation and runner capacity.</p>
        </div>
        <Link
          className="inline-flex w-fit rounded-md border border-black/15 bg-white px-3 py-1.5 font-bold text-[#1f2328]"
          href={`${baseHref}/settings/runners`}
        >
          Manage runners
        </Link>
      </section>
    </div>
  );
}
