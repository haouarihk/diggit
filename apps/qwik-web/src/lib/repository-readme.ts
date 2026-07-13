import {
  getRepositoryFile,
  type RepositoryFile,
  type RepositoryTreeEntry,
} from "~/lib/api";

export function findReadmeEntry(entries: RepositoryTreeEntry[]) {
  return (
    entries.find(
      (entry) => entry.kind === "file" && entry.name.toLowerCase() === "readme.md",
    ) ?? null
  );
}

export async function getRepositoryReadme(
  owner: string,
  name: string,
  refName: string,
  entries: RepositoryTreeEntry[],
): Promise<RepositoryFile | null> {
  const readmeEntry = findReadmeEntry(entries);
  if (!readmeEntry) {
    return null;
  }

  return getRepositoryFile(owner, name, readmeEntry.path, refName).catch(() => null);
}
