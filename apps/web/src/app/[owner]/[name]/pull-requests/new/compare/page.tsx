import { PullRequestCompareStep } from "@/components/PullRequestFlow";
import { RepoHeader, RepoPageContent, repoHref } from "@/components/RepoHeader";
import {
  comparePullRequestBranches,
  getPullRequestOptions,
  getRepository,
  listPullRequests,
  type PullRequestSourceOption,
  type RepositoryBranch,
  type RepositoryCompare,
} from "@/lib/api";
import {
  branchLabel,
  defaultBranch,
  decodePullRequestSource,
  encodePullRequestSource,
  fallbackBranches,
  normalizeServerUrl,
  parseRepositoryUrl,
  remoteRepositoryGitUrl,
  sourceFromOption,
  type PullRequestSourceMode,
  type PullRequestSourceSelection,
} from "@/lib/pull-request-flow";

type Props = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{
    from?: string;
    server?: string;
    sourceMode?: string;
    targetBranch?: string;
  }>;
};

export default async function ComparePullRequestPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { from, server, sourceMode: rawSourceMode, targetBranch } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const sourceMode = normalizeSourceMode(rawSourceMode);
  const [repo, pullRequests, options] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
    getPullRequestOptions(decodedOwner, decodedName),
  ]);

  const targetBranches = options.repository.branches.length > 0 ? options.repository.branches : fallbackBranches(repo.default_branch);
  const selectedTarget = targetBranch || defaultBranch(targetBranches, repo.default_branch);
  const sourceData = await sourceOptionsForMode(sourceMode, {
    name: decodedName,
    options,
    owner: decodedOwner,
    server,
  });
  const selectedSource = decodePullRequestSource(from) ?? sourceData.defaultSelection;
  const selectedFrom = selectedSource ? encodePullRequestSource(selectedSource) : "";
  const compare = selectedSource
    ? await comparePullRequestBranches(decodedOwner, decodedName, {
        source_branch: selectedSource.branch,
        source_repo_url: selectedSource.url,
        source_repository_id: selectedSource.repositoryId,
        target_branch: selectedTarget,
      }).catch((error) => unavailableCompare(error))
    : unavailableCompare("Choose a source branch to compare.");

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="pull-requests" pullRequestsCount={pullRequests.data.length} repo={repo} />

      <RepoPageContent>
        <section className="grid gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">New pull request</h2>
            <p className="text-[#59636e]">Review the branch diff before creating the pull request.</p>
          </div>

          <PullRequestCompareStep
            baseHref={baseHref}
            fromOptions={sourceData.groups}
            initialCompare={compare}
            name={decodedName}
            owner={decodedOwner}
            selectedFrom={selectedFrom}
            selectedTarget={selectedTarget}
            serverName={server}
            sourceMode={sourceMode}
            targetOptions={targetBranches.map((branch) => ({ label: branchLabel(branch), value: branch.name }))}
            upstreamLabel={options.upstream ? `${options.upstream.owner_handle}/${options.upstream.name}` : undefined}
          />
        </section>
      </RepoPageContent>
    </div>
  );
}

async function sourceOptionsForMode(
  sourceMode: PullRequestSourceMode,
  input: {
    name: string;
    options: {
      repository: PullRequestSourceOption;
      forks: PullRequestSourceOption[];
      upstream: PullRequestSourceOption | null;
    };
    owner: string;
    server?: string;
  },
): Promise<{
  defaultSelection: PullRequestSourceSelection | null;
  groups: { label: string; options: { label: string; value: string }[] }[];
}> {
  if (sourceMode === "server") {
    const serverUrl = normalizeServerUrl(input.server ?? "");
    const branches = serverUrl ? await fetchBranches({ baseUrl: serverUrl, owner: input.owner, name: input.name }) : [];
    const sourceUrl = serverUrl ? remoteRepositoryGitUrl(serverUrl, input.owner, input.name) : "";
    return {
      defaultSelection: branches[0] && sourceUrl ? { branch: branches[0].name, repositoryId: null, url: sourceUrl } : null,
      groups: [
        {
          label: "Branches from that server",
          options: branches.map((branch) => ({
            label: branchLabel(branch),
            value: encodePullRequestSource({ branch: branch.name, repositoryId: null, url: sourceUrl }),
          })),
        },
      ],
    };
  }

  if (sourceMode === "upstream") {
    const upstream = input.options.upstream;
    const branches = upstream ? await branchesForSourceOption(upstream) : [];
    return {
      defaultSelection: upstream && branches[0] ? sourceFromOption(upstream, branches[0].name) : null,
      groups: [
        {
          label: "Branches from original repository",
          options: upstream
            ? branches.map((branch) => ({
                label: `${upstream.owner_handle}/${upstream.name}:${branchLabel(branch)}`,
                value: encodePullRequestSource(sourceFromOption(upstream, branch.name)),
              }))
            : [],
        },
      ],
    };
  }

  const repoBranches = input.options.repository.branches.length > 0 ? input.options.repository.branches : fallbackBranches("main");
  const forkOptions = input.options.forks.flatMap((fork) =>
    fork.branches.map((branch) => ({
      label: `${fork.owner_handle}/${fork.name}:${branchLabel(branch)}`,
      value: encodePullRequestSource(sourceFromOption(fork, branch.name)),
    })),
  );

  return {
    defaultSelection: repoBranches[0] ? sourceFromOption(input.options.repository, repoBranches[0].name) : null,
    groups: [
      {
        label: "Branches in this repository",
        options: repoBranches.map((branch) => ({
          label: branchLabel(branch),
          value: encodePullRequestSource(sourceFromOption(input.options.repository, branch.name)),
        })),
      },
      ...(forkOptions.length > 0 ? [{ label: "Branches from forks", options: forkOptions }] : []),
    ],
  };
}

async function branchesForSourceOption(option: PullRequestSourceOption) {
  if (option.branches.length > 0) {
    return option.branches;
  }

  const parsed = parseRepositoryUrl(option.url);
  return parsed ? fetchBranches(parsed) : [];
}

async function fetchBranches(repo: { baseUrl?: string; owner: string; name: string }) {
  const baseUrl = repo.baseUrl ?? "";
  if (!baseUrl) {
    return [];
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { data?: RepositoryBranch[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

function normalizeSourceMode(value?: string): PullRequestSourceMode {
  return value === "server" || value === "upstream" ? value : "local";
}

function unavailableCompare(error: unknown): RepositoryCompare {
  return {
    ahead_by: 0,
    ahead_commits: [],
    behind_by: 0,
    behind_commits: [],
    files: [],
    message: error instanceof Error ? error.message : String(error),
    source: null,
    status: "unavailable",
  };
}
