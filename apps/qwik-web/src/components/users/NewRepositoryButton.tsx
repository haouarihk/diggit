import {
  $,
  component$,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { clearAuthSession, getAuthToken } from "~/lib/auth-session";
import { publicApiBaseUrl, type CurrentUser } from "~/lib/api";

type NewRepositoryButtonProps = {
  owner: string;
  ownerUserId?: string | null;
  organizationCreatorId?: string | null;
};

export const NewRepositoryButton = component$(
  ({ owner, ownerUserId, organizationCreatorId }: NewRepositoryButtonProps) => {
    const user = useSignal<CurrentUser | null>(null);
    const status = useSignal<"anonymous" | "authenticated" | "loading">(
      "anonymous",
    );

    const loadUser = $(async () => {
      const token = getAuthToken();
      if (!token) {
        user.value = null;
        status.value = "anonymous";
        return;
      }

      status.value = "loading";
      const response = await fetch(`${publicApiBaseUrl()}/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        clearAuthSession();
        user.value = null;
        status.value = "anonymous";
        return;
      }

      user.value = (await response.json()) as CurrentUser;
      status.value = "authenticated";
    });

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
      await loadUser();
    });

    useOnWindow("diggit-auth-changed", loadUser);

    const canCreate =
      Boolean(user.value?.id && ownerUserId && user.value.id === ownerUserId) ||
      Boolean(
        user.value?.id &&
          organizationCreatorId &&
          user.value.id === organizationCreatorId,
      );

    if (status.value === "loading" || !canCreate) {
      return null;
    }

    return (
      <Link
        class="user-new-repository-button"
        href={`/new/repository?owner=${encodeURIComponent(owner)}`}
      >
        New
      </Link>
    );
  },
);
