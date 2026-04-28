import { NextRequest, NextResponse } from "next/server";

const OWNER_SESSION_COOKIE = "clipperviral_owner_session";
const SHARE_SESSION_COOKIE = "clipperviral_ops_share_session";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getOwnerConfig() {
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ALLOWED_EMAIL || "").trim();
  const ownerPassword = (process.env.OWNER_PASSWORD || "").trim();
  const secret = (process.env.OWNER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "clipperviral-secret").trim();

  return {
    ownerEmail: normalizeEmail(ownerEmail),
    ownerPassword,
    secret,
  };
}

function getShareConfig() {
  const token = (process.env.OPS_SHARE_TOKEN || "").trim();
  const secret = (process.env.OWNER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "clipperviral-secret").trim();

  return { token, secret };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hasValidOwnerSession(request: NextRequest) {
  const token = request.cookies.get(OWNER_SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  const config = getOwnerConfig();
  if (!config.ownerEmail || !config.ownerPassword) {
    return false;
  }

  const expected = await sha256Hex(`${config.ownerEmail}::${config.ownerPassword}::${config.secret}`);
  return token === expected;
}

async function createShareSessionToken() {
  const config = getShareConfig();
  return sha256Hex(`ops-share::${config.token}::${config.secret}`);
}

async function hasValidShareSession(request: NextRequest) {
  const token = request.cookies.get(SHARE_SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  const config = getShareConfig();
  if (!config.token) {
    return false;
  }

  const expected = await createShareSessionToken();
  return token === expected;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const protectedPath = pathname === "/ops" || pathname.startsWith("/ops/") || pathname === "/ops-template.html";

  if (!protectedPath) {
    return NextResponse.next();
  }

  if (await hasValidOwnerSession(request) || await hasValidShareSession(request)) {
    return NextResponse.next();
  }

  const shareToken = searchParams.get("share");
  const shareConfig = getShareConfig();
  if (shareToken && shareConfig.token && shareToken === shareConfig.token) {
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete("share");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(SHARE_SESSION_COOKIE, await createShareSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return response;
  }

  const signInUrl = new URL("/auth/signin", request.url);
  signInUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  signInUrl.searchParams.set("owner", "1");
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/ops/:path*", "/ops-template.html"],
};
