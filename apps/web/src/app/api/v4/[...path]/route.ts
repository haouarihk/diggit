import { proxyApiRequest } from "@/lib/api-proxy";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxyApiRequest(request, `/api/v4/${path.map(encodeURIComponent).join("/")}`);
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
