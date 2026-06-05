import { RunnerPanel } from "@/components/RunnerPanel";

type Props = {
  params: Promise<{ owner: string; name: string }>;
};

export default async function RepositoryRunnersPage({ params }: Props) {
  const { owner, name } = await params;
  const decodedOwner = decodeURIComponent(owner);
  const decodedName = decodeURIComponent(name);

  return (
    <div className="grid gap-6">
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
