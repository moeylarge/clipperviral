import { NextRequest, NextResponse } from "next/server";

import { createManualSessionToken, OWNER_SESSION_COOKIE, verifyManualCredentials } from "@/lib/auth/manual-session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = verifyManualCredentials(email, password);
  if (!result.ok) {
    const status = result.reason === "missing_config" ? 500 : 401;
    const error =
      result.reason === "missing_config"
        ? "Missing OWNER_EMAIL/OWNER_PASSWORD env configuration."
        : "Invalid email or password.";
    return NextResponse.json({ error }, { status });
  }

  const response = NextResponse.json({ ok: true, email: result.email });
  response.cookies.set(OWNER_SESSION_COOKIE, createManualSessionToken(result.email), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
