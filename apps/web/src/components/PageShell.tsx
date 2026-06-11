"use client";

import { isRepositoryPath } from "@/lib/routes";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isRepositoryPath(pathname)) {
    return children;
  }

  return <div className="mx-auto w-full max-w-7xl">{children}</div>;
}
