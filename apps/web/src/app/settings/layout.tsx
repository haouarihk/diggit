import Link from "next/link";

type UserSettingsLayoutProps = {
  children: React.ReactNode;
};

export default function UserSettingsLayout({ children }: UserSettingsLayoutProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="self-start rounded-md border border-[#d0d7de] bg-white">
        <nav aria-label="User settings" className="grid p-2">
          <SettingsLink href="/settings" label="General" />
          <SettingsLink href="/settings/keys" label="SSH keys" />
          <SettingsLink href="/settings/runners" label="Runners" />
          <SettingsLink href="/settings/oauth/applications" label="OAuth applications" />
          <SettingsLink href="/settings/oauth/tokens" label="OAuth tokens" />
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
