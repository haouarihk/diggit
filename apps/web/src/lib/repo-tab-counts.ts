import { listPullRequests, listReleases, listRepositoryIssues, type Repository } from "@/lib/api";

type RepoTabCounts = {
  issuesCount: number;
  pullRequestsCount: number;
  releasesCount: number;
};

export async function getRepoTabCounts(
  repo: Pick<Repository, "issues_enabled" | "name" | "owner_handle" | "pull_requests_enabled">,
): Promise<RepoTabCounts> {
  const [issuesCount, pullRequestsCount, releasesCount] = await Promise.all([
    repo.issues_enabled
      ? listRepositoryIssues(repo.owner_handle, repo.name, { limit: 1, page: 1, status: "open" })
          .then((response) => response.pagination.total)
          .catch(() => 0)
      : Promise.resolve(0),
    repo.pull_requests_enabled
      ? listPullRequests(repo.owner_handle, repo.name, { limit: 1, page: 1, status: "open" })
          .then((response) => response.pagination.total)
          .catch(() => 0)
      : Promise.resolve(0),
    listReleases(repo.owner_handle, repo.name, { limit: 1, page: 1, status: "all" })
      .then((response) => response.pagination.total)
      .catch(() => 0),
  ]);

  return {
    issuesCount,
    pullRequestsCount,
    releasesCount,
  };
}
