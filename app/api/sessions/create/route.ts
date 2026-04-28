import { NextRequest, NextResponse } from "next/server";

import { ensureFwtovUserForAuth } from "@/lib/auth/fwtov-user";
import { createSession } from "@/lib/session/store";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { personaSlug?: string };
    if (!body.personaSlug) {
      return NextResponse.json({ error: "personaSlug is required" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "sign-in is required to start a live visit" }, { status: 401 });
    }

    const appUser = await ensureFwtovUserForAuth(user);
    const session = await createSession({
      personaSlug: body.personaSlug,
      userId: appUser.external_user_id,
    });

    return NextResponse.json({
      sessionId: session.id,
      session,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status =
      message === "free trial already used; purchase Gold Coins to start another visit"
        ? 402
        : message === "daily free trial limit reached"
          ? 429
          : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
