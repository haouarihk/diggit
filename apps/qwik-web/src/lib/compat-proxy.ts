import { serverApiBaseUrl } from "~/lib/api";

const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

export async function maybeProxyCompatRequest(url: URL, request: Request) {
  const targetPath = compatProxyPath(url.pathname);
  if (!targetPath) {
    return null;
  }

  const targetUrl = new URL(`${targetPath}${url.search}`, `${serverApiBaseUrl()}/`);
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: methodAllowsBody(request.method) ? await request.arrayBuffer() : undefined,
      redirect: "manual",
    });

    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch {
    return Response.json(
      { error: "Failed to reach the API compatibility endpoint." },
      { status: 502 },
    );
  }
}

function compatProxyPath(pathname: string) {
  if (pathname === "/oauth" || pathname.startsWith("/oauth/")) {
    return pathname;
  }

  if (pathname === "/api/v4" || pathname.startsWith("/api/v4/")) {
    return pathname;
  }

  if (
    /^\/[^/]+\/[^/]+\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(
      pathname,
    )
  ) {
    return pathname;
  }

  return null;
}

function methodAllowsBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}
