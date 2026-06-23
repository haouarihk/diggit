import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import { RepositoryCodeBrowser } from "@/components/RepositoryCodeBrowser";
import {
  getRepository,
  getRepositoryStats,
  getRepositoryTree,
  listPullRequests,
  listRepositoryContributors,
  listRepositoryBranches,
  listRepositoryLanguages,
  listRepositoryTags,
  type RepositoryTree,
} from "@/lib/api";
import { getRepositoryReadme } from "@/lib/repository-readme";
import { socialPreviewImageUrl } from "@/lib/runtime-config";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{ q?: string; ref?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const repo = await getRepository(decodedOwner, decodedName);
  const title = `${repo.owner_handle}/${repo.name}`;
  const description = repo.description || "Public repository on Diggit.";
  const image = socialPreviewImageUrl(
    `/social/repos/${encodeURIComponent(decodedOwner)}/${encodeURIComponent(decodedName)}/preview.png`,
  );

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: `${title} social preview` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function RepoPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { q, ref } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const repo = await getRepository(decodedOwner, decodedName);
  const selectedRef = ref || repo.default_branch;
  const baseHref = repoHref(decodedOwner, decodedName);
  const [pullRequests, branches, tags, stats, languages, contributors, tree] = await Promise.all([
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    listRepositoryBranches(decodedOwner, decodedName).catch(() => ({
      data: [{ name: repo.default_branch, is_default: true, commit_sha: null }],
    })),
    listRepositoryTags(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getRepositoryStats(decodedOwner, decodedName, selectedRef).catch(() => ({
      branches_count: 0,
      commits_count: 0,
      releases_count: 0,
      tags_count: 0,
    })),
    listRepositoryLanguages(decodedOwner, decodedName, selectedRef).catch(() => ({ data: [] })),
    listRepositoryContributors(decodedOwner, decodedName, selectedRef).catch(() => ({ data: [] })),
    getRepositoryTree(decodedOwner, decodedName, selectedRef).catch(
      (): RepositoryTree => ({ ref_name: selectedRef, last_commit: null, entries: [] }),
    ),
  ]);
  const readme = await getRepositoryReadme(decodedOwner, decodedName, selectedRef, tree.entries);

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />
      <RepoPageContent>
        <RepositoryCodeBrowser
          baseHref={baseHref}
          branches={branches.data}
          mode="tree"
          contributors={contributors.data}
          languages={languages.data}
          owner={decodedOwner}
          query={q}
          readme={readme}
          repo={repo}
          selectedRef={selectedRef}
          stats={stats}
          tags={tags.data}
          tree={tree}
        />
      </RepoPageContent>
    </div>
  );
}
