import { OAuthApplicationsPanel } from "@/components/OAuthApplicationsPanel";

export default function OAuthApplicationsPage() {
  return (
    <div className="grid gap-3.5">
      <section className="mb-6">
        <p className="mb-2 inline-flex rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-2.5 py-1 text-[#59636e]">
          Account settings
        </p>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">OAuth applications</h1>
        <p className="text-[#59636e]">
          Register Dokploy or other clients that need GitLab-compatible access to your Diggit repositories.
        </p>
      </section>
      <OAuthApplicationsPanel initialApplications={[]} />
    </div>
  );
}
