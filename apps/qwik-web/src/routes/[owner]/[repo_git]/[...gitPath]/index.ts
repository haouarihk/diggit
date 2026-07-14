import type { RequestHandler } from "@builder.io/qwik-city";
import { isCompatProxyPath, proxyCompatRequest } from "~/lib/compat-proxy";

export const onRequest: RequestHandler = async ({ request, send, url }) => {
  if (!isCompatProxyPath(url.pathname)) {
    send(
      new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      }),
    );
    return;
  }

  send(await proxyCompatRequest(url, request));
};
