import { CreateRepoForm } from "@/components/RepoActions";

type NewRepositoryPageProps = {
  searchParams: Promise<{
    owner?: string;
  }>;
};

export default async function NewRepositoryPage({ searchParams }: NewRepositoryPageProps) {
  const { owner = "" } = await searchParams;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <section>
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          New project
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Create a new repository</h1>
        <p className="text-[#59636e]">
          Start a repository under your user namespace or an organization where you have access.
        </p>
      </section>

      <CreateRepoForm initialOwner={owner} />
    </div>
  );
}
