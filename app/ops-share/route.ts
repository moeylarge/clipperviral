import { NextResponse } from "next/server";

import { createShareSessionToken, SHARE_SESSION_COOKIE } from "@/lib/auth/manual-session";

export async function GET(request: Request) {
  const target = new URL("/ops", request.url);
  const response = NextResponse.redirect(target);

  response.cookies.set(SHARE_SESSION_COOKIE, createShareSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
