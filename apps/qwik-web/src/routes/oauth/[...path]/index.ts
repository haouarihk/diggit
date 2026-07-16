import type { RequestHandler } from "@builder.io/qwik-city";
import { proxyCompatRequest } from "~/lib/compat-proxy";
import { authTokenFromCookie } from "~/lib/server-auth";

export const onRequest: RequestHandler = async ({ cookie, request, send, url }) => {
  send(
    await proxyCompatRequest(url, request, {
      bearerToken: authTokenFromCookie(cookie),
    }),
  );
};
