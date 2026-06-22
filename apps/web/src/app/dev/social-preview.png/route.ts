import { publicApiBaseUrl } from "@/lib/runtime-config";
import { NextRequest, NextResponse } from "next/server";

export function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const target = new URL(`${publicApiBaseUrl()}/dev/social-preview.png`);
  target.search = request.nextUrl.search;
  return fetch(target, { cache: "no-store" });
}
