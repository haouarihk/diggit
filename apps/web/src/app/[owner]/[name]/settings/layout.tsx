import Link from "next/link";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { getRepository, listPullRequests } from "@/lib/api";

type RepositorySettingsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export default async function RepositorySettingsLayout({ children, params }: RepositorySettingsLayoutProps) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const settingsHref = `${repoHref(decodedOwner, decodedName)}/settings`;
  const [repo, pullRequests] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [], pagination: { page: 1, limit: 1, total: 0, totalPages: 0 } })),
  ]);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="settings" pullRequestsCount={pullRequests.pagination?.total ?? pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="self-start rounded-md border border-[#d0d7de] bg-white">
            <nav aria-label="Repository settings" className="grid p-2">
              <SettingsLink href={settingsHref} label="General" />
              <SettingsLink href={`${settingsHref}/collaborators`} label="Collaborators" />
              <SettingsLink href={`${settingsHref}/secrets`} label="Secrets and variables" />
              <SettingsLink href={`${settingsHref}/webhooks`} label="Webhooks" />
            </nav>
          </aside>
          {children}
        </div>
      </RepoPageContent>
    </div>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="rounded-md px-3 py-2 font-semibold text-[#59636e] hover:bg-[#f6f8fa] hover:text-[#1f2328]" href={href}>
      {label}
    </Link>
  );
}
