import { proxyApiRequest } from "@/lib/api-proxy";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const prefix = "/api/v4";
  const proxiedPath = request.nextUrl.pathname.startsWith(`${prefix}/`)
    ? request.nextUrl.pathname
    : `${prefix}/${path.map(encodeURIComponent).join("/")}`;
  return proxyApiRequest(request, proxiedPath);
}

export function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
