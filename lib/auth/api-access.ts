import { NextResponse } from "next/server";

import { getManualSessionEmail } from "@/lib/auth/manual-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function getAllowedEmails() {
  const raw = process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function requireAllowedApiUser() {
  const allowedEmails = getAllowedEmails();
  if (!allowedEmails.size) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Server is missing ALLOWED_EMAIL configuration.",
          details: "Set ALLOWED_EMAIL (or ALLOWED_EMAILS) in environment variables.",
        },
        { status: 500 }
      ),
    };
  }

  const manualEmail = await getManualSessionEmail();
  if (manualEmail) {
    if (!allowedEmails.has(manualEmail)) {
      return {
        ok: false as const,
        response: NextResponse.json(
          {
            error: "Forbidden",
            details: `Signed-in email (${manualEmail}) is not on this deployment allowlist.`,
          },
          { status: 403 }
        ),
      };
    }
    return {
      ok: true as const,
      user: { email: manualEmail },
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Unauthorized",
          details: "Sign in with your allowed Google account to use this feature.",
        },
        { status: 401 }
      ),
    };
  }

  const email = user.email.toLowerCase();
  if (!allowedEmails.has(email)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: "Forbidden",
          details: `Signed-in email (${email}) is not on this deployment allowlist.`,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, user };
}
