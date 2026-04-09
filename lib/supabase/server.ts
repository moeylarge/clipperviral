import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
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
          cookiesToSet.forEach((cookie: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }) => {
            try {
              cookieStore.set(cookie.name, cookie.value, cookie.options);
            } catch {
              // Ignore cookie writes in contexts where response mutation is not available.
            }
          });
        },
      },
    },
  );
}
