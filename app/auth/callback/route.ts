import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/auth/signin", requestUrl.origin));
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
    return NextResponse.redirect(new URL("/auth/signin?error=oauth_callback_failed", requestUrl.origin));
  }

  return response;
}
