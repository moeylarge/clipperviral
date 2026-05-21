import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { ensureFwtovUserForAuth } from "@/lib/auth/fwtov-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function shouldProvisionFwtovUser() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSafeNext(next: string | null, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(next, "https://project-fwtov.local");
    if (parsed.origin !== "https://project-fwtov.local") {
      return fallback;
    }

    if (parsed.pathname === "/auth/callback") {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function getLoginErrorRedirect(origin: string, code: string, message: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("error", code);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url);
}

function isClipperViralHost(hostname: string) {
  return (
    hostname === "www.clipperviral.com" ||
    hostname === "clipperviral.com" ||
    hostname.startsWith("clipperviral-")
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const flow = requestUrl.searchParams.get("flow");
  const isCvFlow = flow === "cv" || isClipperViralHost(requestUrl.hostname);
  const next = getSafeNext(requestUrl.searchParams.get("next"), isCvFlow ? "/editor.html" : "/");

  if (!code) {
    if (isCvFlow) {
      return getLoginErrorRedirect(requestUrl.origin, "missing_code", "Google sign-in did not return an authorization code.");
    }
    return NextResponse.redirect(new URL("/?auth=missing_code", requestUrl.origin));
  }

  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split(";")
            .map((cookie) => {
              const [name, ...rest] = cookie.trim().split("=");
              return { name, value: rest.join("=") };
            })
            .filter((cookie) => cookie.name) ?? [];
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: {
              domain?: string;
              path?: string;
              expires?: Date;
              maxAge?: number;
              httpOnly?: boolean;
              secure?: boolean;
              sameSite?: "lax" | "strict" | "none" | boolean;
            };
          }>,
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    if (isCvFlow) {
      return getLoginErrorRedirect(requestUrl.origin, "callback_failed", "Google sign-in could not be completed.");
    }
    return NextResponse.redirect(new URL("/?auth=callback_failed", requestUrl.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isCvFlow) {
    if (!user) {
      return getLoginErrorRedirect(requestUrl.origin, "missing_user", "Google sign-in completed without a user session.");
    }

    try {
      const admin = getSupabaseAdmin();
      const ensured = await admin.rpc("ensure_cv_subscriber", {
        p_auth_user_id: user.id,
        p_email: user.email ?? "",
      });

      if (ensured.error) {
        console.error("Failed to provision ClipperViral subscriber during auth callback", ensured.error);
        return getLoginErrorRedirect(requestUrl.origin, "subscriber_failed", "Your sign-in worked, but your trial account could not be prepared.");
      }
    } catch (error) {
      console.error("Failed to provision ClipperViral subscriber during auth callback", error);
      return getLoginErrorRedirect(requestUrl.origin, "subscriber_failed", "Your sign-in worked, but your trial account could not be prepared.");
    }

    return response;
  }

  if (user && shouldProvisionFwtovUser()) {
    try {
      await ensureFwtovUserForAuth(user);
    } catch (error) {
      console.error("Failed to provision FWTOV user during auth callback", error);
    }
  }

  return response;
}
