import type { Metadata } from "next";
import { NavBar } from "@/components/NavBar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeScript } from "@/components/ThemeScript";
import { runtimeConfigScript } from "@/lib/runtime-config";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diggit",
  description: "Federated Git hosting for cross-server forks and pull requests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <script dangerouslySetInnerHTML={{ __html: runtimeConfigScript() }} id="diggit-runtime-config" />
      </head>
      <body className="bg-[#f6f8fa] text-sm leading-6 text-[#1f2328]">
        <ThemeProvider>
          <main className="mx-auto max-w-7xl px-6 pb-12">
            <NavBar />
            {children}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
