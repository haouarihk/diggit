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

type ProxyCompatRequestOptions = {
  bearerToken?: string | null;
};

export async function proxyCompatRequest(
  url: URL,
  request: Request,
  options?: ProxyCompatRequestOptions,
) {
  const targetUrl = new URL(
    `${url.pathname}${url.search}`,
    `${serverApiBaseUrl()}/`,
  );
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  if (options?.bearerToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
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

export function isCompatProxyPath(pathname: string) {
  if (pathname === "/oauth" || pathname.startsWith("/oauth/")) {
    return true;
  }

  if (pathname === "/api/v4" || pathname.startsWith("/api/v4/")) {
    return true;
  }

  if (
    /^\/[^/]+\/[^/]+\.git\/(info\/refs|git-upload-pack|git-receive-pack)$/.test(
      pathname,
    )
  ) {
    return true;
  }

  return false;
}

export async function maybeProxyCompatRequest(url: URL, request: Request) {
  if (!isCompatProxyPath(url.pathname)) {
    return null;
  }

  return proxyCompatRequest(url, request);
}

function methodAllowsBody(method: string) {
  return method !== "GET" && method !== "HEAD";
}
