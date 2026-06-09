import { proxyApiRequest } from "@/lib/api-proxy";
import type { NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{
    owner: string;
    name: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { owner, name } = await context.params;
  return proxyApiRequest(request, `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git-upload-pack`);
}
