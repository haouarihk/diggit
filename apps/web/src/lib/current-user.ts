import "server-only";

import { apiFetch, type CurrentUser } from "@/lib/api";

export function getCurrentUser() {
  return apiFetch<CurrentUser>("/auth/me").catch(() => null);
}
