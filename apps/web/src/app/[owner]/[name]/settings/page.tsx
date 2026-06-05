import { DeleteRepositoryButton } from "@/components/DeleteRepositoryButton";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests } from "@/lib/api";
import Link from "next/link";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositorySettingsPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);
  const redirectTo =
    repo.owner.kind === "organization"
      ? `/organizations/${encodeURIComponent(repo.owner_handle)}/repositories`
      : `/${encodeURIComponent(repo.owner_handle)}`;

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="settings" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <section className="grid gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">Repository settings</h2>
        <p className="text-[#59636e]">Manage repository options for {repo.owner_handle}/{repo.name}.</p>
      </section>

      <section className="grid gap-3 rounded-md border border-[#d0d7de] bg-white p-4">
        <h3 className="text-lg font-semibold">Actions runners</h3>
        <p className="text-sm text-[#59636e]">Manage repository-scope Gitea-compatible runners.</p>
        <Link
          className="w-fit rounded-md border border-[#d0d7de] bg-white px-3 py-1.5 font-semibold text-[#1f2328] hover:border-[#0969da] hover:text-[#0969da]"
          href={`${baseHref}/settings/runners`}
        >
          Manage runners
        </Link>
      </section>

      <section className="grid gap-3 rounded-md border border-[#ffebe9] bg-[#fff8f8] p-4">
        <div className="grid gap-1">
          <h3 className="text-lg font-semibold text-[#cf222e]">Delete repository</h3>
          <p className="text-sm text-[#59636e]">
            Permanently delete this repository, its database records, and its Git storage. This cannot be undone.
          </p>
        </div>
        <DeleteRepositoryButton name={repo.name} owner={repo.owner_handle} redirectTo={redirectTo} />
      </section>
    </div>
  );
}
