"use client";

import { apiBaseUrl } from "@/lib/runtime-config";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CurrentUser } from "@/lib/api";
import { getAuthToken } from "@/lib/auth-session";

const API_URL = apiBaseUrl();

type NewRepositoryButtonProps = {
  owner: string;
  ownerUserId?: string | null;
  organizationCreatorId?: string | null;
};

export function NewRepositoryButton({ owner, ownerUserId, organizationCreatorId }: NewRepositoryButtonProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const token = getAuthToken();
      if (!token) {
        return;
      }
      const response = await fetch(`${API_URL}/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setUser((await response.json()) as CurrentUser);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  const canCreate =
    Boolean(user?.id && ownerUserId && user.id === ownerUserId) ||
    Boolean(user?.id && organizationCreatorId && user.id === organizationCreatorId);

  if (!canCreate) {
    return null;
  }

  return (
    <Link className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]" href={`/new/repository?owner=${encodeURIComponent(owner)}`}>
      New
    </Link>
  );
}
