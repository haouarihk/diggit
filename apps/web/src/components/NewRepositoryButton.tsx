"use client";

import { useCurrentUser } from "@/components/useCurrentUser";
import Link from "next/link";

type NewRepositoryButtonProps = {
  owner: string;
  ownerUserId?: string | null;
  organizationCreatorId?: string | null;
};

export function NewRepositoryButton({ owner, ownerUserId, organizationCreatorId }: NewRepositoryButtonProps) {
  const { status, user } = useCurrentUser();

  const canCreate =
    Boolean(user?.id && ownerUserId && user.id === ownerUserId) ||
    Boolean(user?.id && organizationCreatorId && user.id === organizationCreatorId);

  if (status === "loading" || !canCreate) {
    return null;
  }

  return (
    <Link className="rounded-md border border-black/15 bg-[#1a7f37] px-3 py-1.5 font-bold text-white hover:bg-[#116329]" href={`/new/repository?owner=${encodeURIComponent(owner)}`}>
      New
    </Link>
  );
}
