import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

function getEditorLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", "/editor.html");
  return NextResponse.redirect(loginUrl);
}

function getPricingRedirect(request: NextRequest, reason: "trial_expired" | "payment_failed" | "inactive") {
  const pricingUrl = new URL("/pricing", request.url);
  pricingUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(pricingUrl);
}

function createMiddlewareSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof response.cookies.set>[2];
          }>,
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
}

function isFuture(value: string | null | undefined) {
  return value ? new Date(value).getTime() > Date.now() : false;
}

function getNoAccessReason(subscriber: { status: string; trial_ends_at: string | null; current_period_end: string | null }) {
  if (subscriber.status === "trialing" && !isFuture(subscriber.trial_ends_at)) {
    return "trial_expired";
  }

  if (subscriber.status === "past_due") {
    return "payment_failed";
  }

  return "inactive";
}

async function gateClipperViralEditor(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return getEditorLoginRedirect(request);
  }

  const { data: subscriber, error } = await getSupabaseAdmin()
    .from("cv_subscribers")
    .select("status, trial_ends_at, current_period_end")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !subscriber) {
    return getEditorLoginRedirect(request);
  }

  const hasAccess =
    subscriber.status === "active" ||
    (subscriber.status === "trialing" && isFuture(subscriber.trial_ends_at)) ||
    (subscriber.status === "past_due" && isFuture(subscriber.current_period_end));

  if (hasAccess) {
    return response;
  }

  return getPricingRedirect(request, getNoAccessReason(subscriber));
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const protectedPath = pathname === "/ops" || pathname.startsWith("/ops/") || pathname === "/ops-template.html";

  if (protectedPath) {
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

  if (pathname === "/editor.html") {
    return gateClipperViralEditor(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/ops/:path*", "/ops-template.html", "/editor.html"],
};
