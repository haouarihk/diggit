import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { PageShell } from "@/components/PageShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeScript } from "@/components/ThemeScript";
import { CurrentUserProvider } from "@/components/useCurrentUser";
import { getCurrentUser } from "@/lib/current-user";
import { runtimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diggit",
  description: "Federated Git hosting for cross-server forks and pull requests.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getCurrentUser();
  const currentUserKey = currentUser
    ? `${currentUser.kind ?? "local"}:${currentUser.username}:${currentUser.home_server ?? ""}`
    : "anonymous";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript() }} id="diggit-runtime-config" />
      </head>
      <body className="h-full bg-[#f6f8fa] text-sm leading-6 text-[#1f2328]">
        <ThemeProvider>
          <CurrentUserProvider initialUser={currentUser} key={currentUserKey}>
            <main className="min-h-screen px-6 pb-12">
              <NavBar />
              <PageShell>{children}</PageShell>
            </main>
          </CurrentUserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
