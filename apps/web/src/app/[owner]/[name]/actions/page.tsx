import Link from "next/link";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests } from "@/lib/api";

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
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="actions" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <RepoPageContent>
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold">Actions</h2>
              <p className="text-sm text-[#59636e]">Manage repository automation and runner capacity.</p>
            </div>
            <Link
              className="inline-flex rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]"
              href={`${baseHref}/settings/runners`}
            >
              Manage runners
            </Link>
          </div>
        </section>
      </RepoPageContent>
    </div>
  );
}
