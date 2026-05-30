import { RunnerPanel } from "@/components/RunnerPanel";

type Props = {
  params: Promise<{ org: string }>;
};

export default async function OrganizationRunnersPage({ params }: Props) {
  const { org } = await params;
  const decodedOrg = decodeURIComponent(org);

  return (
    <main className="grid gap-3.5">
      <section className="mb-6 rounded-md border border-[#d0d7de] bg-white p-5">
        <h2 className="mb-3 text-2xl font-semibold tracking-tight">{decodedOrg} runners</h2>
        <p className="text-[#59636e]">Manage organization-scope Gitea-compatible runners.</p>
      </section>
      <RunnerPanel
        listPath={`/orgs/${encodeURIComponent(decodedOrg)}/actions/runners`}
        scopeLabel={`${decodedOrg} organization`}
        tokenPath={`/orgs/${encodeURIComponent(decodedOrg)}/actions/runners/registration-token`}
      />
    </main>
  );
}
