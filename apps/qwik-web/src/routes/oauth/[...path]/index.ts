import type { RequestHandler } from "@builder.io/qwik-city";
import { proxyCompatRequest } from "~/lib/compat-proxy";

export const onRequest: RequestHandler = async ({ request, send, url }) => {
  send(await proxyCompatRequest(url, request));
};
