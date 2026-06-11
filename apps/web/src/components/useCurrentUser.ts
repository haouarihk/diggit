"use client";

import { useEffect, useState } from "react";
import type { CurrentUser } from "@/lib/api";
import { clearAuthSession, getAuthToken } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";

const API_URL = apiBaseUrl();

async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    clearAuthSession();
    return null;
  }

  return (await response.json()) as CurrentUser;
}

export function useCurrentUser(enabled = true) {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;

    async function loadUser() {
      const nextUser = await fetchCurrentUser();
      if (active) {
        setUser(nextUser);
      }
    }

    const timeout = window.setTimeout(() => {
      void loadUser();
    }, 0);

    function handleAuthChange() {
      void loadUser();
    }

    window.addEventListener("diggit-auth-changed", handleAuthChange);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener("diggit-auth-changed", handleAuthChange);
    };
  }, [enabled]);

  function signOut() {
    clearAuthSession();
    setUser(null);
    window.dispatchEvent(new Event("diggit-auth-changed"));
  }

  return { signOut, user };
}
