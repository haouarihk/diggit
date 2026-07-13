"use client";

import { useRouter } from "next/navigation";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/api";
import { clearAuthSession, getAuthToken } from "@/lib/auth-session";
import { apiBaseUrl } from "@/lib/runtime-config";

const API_URL = apiBaseUrl();

type CurrentUserStatus = "anonymous" | "authenticated" | "loading";

type CurrentUserContextValue = {
  signOut: () => void;
  status: CurrentUserStatus;
  user: CurrentUser | null;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

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

export function CurrentUserProvider({ children, initialUser }: { children: ReactNode; initialUser: CurrentUser | null }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(initialUser);
  const [status, setStatus] = useState<CurrentUserStatus>(initialUser ? "authenticated" : "anonymous");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const token = getAuthToken();
      if (!token) {
        if (active) {
          setUser(null);
          setStatus("anonymous");
        }
        return;
      }

      if (active) {
        setStatus("loading");
      }

      const nextUser = await fetchCurrentUser();
      if (active) {
        setUser(nextUser);
        setStatus(nextUser ? "authenticated" : "anonymous");
      }
    }

    if (!initialUser && getAuthToken()) {
      void loadUser();
    }

    function handleAuthChange() {
      void loadUser();
    }

    window.addEventListener("diggit-auth-changed", handleAuthChange);
    return () => {
      active = false;
      window.removeEventListener("diggit-auth-changed", handleAuthChange);
    };
  }, [initialUser]);

  const signOut = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setStatus("anonymous");
    router.refresh();
  }, [router]);

  const value = useMemo<CurrentUserContextValue>(() => ({ signOut, status, user }), [signOut, status, user]);

  return createElement(CurrentUserContext.Provider, { value }, children);
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  }
  return context;
}
