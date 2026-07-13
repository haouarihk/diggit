import type { RequestHandler } from "@builder.io/qwik-city";
import { userProfileHref } from "~/lib/user-profile";

export const onGet: RequestHandler = ({ params, redirect, url }) => {
  throw redirect(
    308,
    `${userProfileHref(params.username)}${url.search}`,
  );
};
