import { NextResponse } from "next/server";

import { OWNER_SESSION_COOKIE } from "@/lib/auth/manual-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0,
  });
  return response;
}
