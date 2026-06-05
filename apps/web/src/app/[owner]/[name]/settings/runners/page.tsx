import { RunnerPanel } from "@/components/RunnerPanel";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests } from "@/lib/api";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryRunnersPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="settings" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Repository runners</h2>
        <p className="text-[#59636e]">Manage repository-scope Gitea-compatible runners.</p>
      </section>
      <RunnerPanel
        listPath={`/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/actions/runners`}
        scopeLabel={`${decodedOwner}/${decodedName}`}
        tokenPath={`/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/actions/runners/registration-token`}
      />
    </div>
  );
}
