import Link from "next/link";
import { organizationHref } from "@/lib/routes";

type OrganizationSettingsLayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    org: string;
  }>;
};

export default async function OrganizationSettingsLayout({ children, params }: OrganizationSettingsLayoutProps) {
  const { org } = await params;
  const decodedOrg = decodeURIComponent(org);
  const settingsHref = `${organizationHref(decodedOrg)}/settings`;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="self-start rounded-md border border-[#d0d7de] bg-white">
        <nav aria-label="Organization settings" className="grid p-2">
          <SettingsLink href={settingsHref} label="General" />
          <SettingsLink href={`${settingsHref}/runners`} label="Runners" />
        </nav>
      </aside>
      {children}
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
