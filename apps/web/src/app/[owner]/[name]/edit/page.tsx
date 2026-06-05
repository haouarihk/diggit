import Link from "next/link";
import { FileEditor } from "@/components/FileEditor";
import { RepoHeader, repoHref } from "@/components/RepoHeader";
import { getRepository, getRepositoryFile, listPullRequests } from "@/lib/api";

type Props = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
  searchParams: Promise<{
    file?: string;
  }>;
};

export default async function EditRepositoryFilePage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { file } = await searchParams;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);
  const baseHref = repoHref(decodedOwner, decodedName);
  const [repo, pullRequests] = await Promise.all([
    getRepository(decodedOwner, decodedName),
    listPullRequests(decodedOwner, decodedName).catch(() => ({ data: [] })),
  ]);
  const selectedFile = file
    ? await getRepositoryFile(decodedOwner, decodedName, file).catch(() => null)
    : null;

  return (
    <div className="grid gap-6">
      <RepoHeader activeTab="code" pullRequestsCount={pullRequests.data.length} repo={repo} />

      {!selectedFile ? (
        <section className="rounded-md border border-[#d0d7de] bg-white p-6">
          <h2 className="text-lg font-semibold">File not found</h2>
          <p className="mt-2 text-[#59636e]">Choose a file from the Code tab before editing.</p>
        </section>
      ) : selectedFile.is_binary ? (
        <section className="rounded-md border border-[#d0d7de] bg-white p-6">
          <h2 className="text-lg font-semibold">Binary files cannot be edited here</h2>
          <p className="mt-2 text-[#59636e]">Use the file preview page to view or delete this file.</p>
          <Link
            className="mt-4 inline-flex rounded-md border border-black/15 bg-white px-3 py-1.5 font-bold text-[#1f2328]"
            href={`${baseHref}?file=${encodeURIComponent(selectedFile.path)}`}
          >
            Back to file
          </Link>
        </section>
      ) : (
        <section className="grid gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Edit {selectedFile.path}</h2>
            <p className="text-[#59636e]">Saving will create a commit on {repo.default_branch}.</p>
          </div>
          <FileEditor
            content={selectedFile.content}
            name={decodedName}
            owner={decodedOwner}
            path={selectedFile.path}
            redirectTo={`${baseHref}?file=${encodeURIComponent(selectedFile.path)}`}
          />
        </section>
      )}
    </div>
  );
}
