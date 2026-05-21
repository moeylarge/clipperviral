import { NextResponse } from "next/server";

import type { CvSubscriber } from "@/lib/cv/subscriber";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusResponse(body: {
  authenticated: boolean;
  status: CvSubscriber["status"] | null;
  trial_ends_at: string | null;
  days_remaining: number | null;
  plan: CvSubscriber["plan"] | null;
  is_pro?: boolean;
  can_use_paste_link?: boolean;
}) {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

function daysRemaining(subscriber: CvSubscriber) {
  if (subscriber.status !== "trialing" || !subscriber.trial_ends_at) return null;
  const trialEndsAt = new Date(subscriber.trial_ends_at).getTime();
  if (!Number.isFinite(trialEndsAt)) return 0;
  return Math.max(0, Math.ceil((trialEndsAt - Date.now()) / 86_400_000));
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return statusResponse({
      authenticated: false,
      status: null,
      trial_ends_at: null,
      days_remaining: null,
      plan: null,
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("cv_subscribers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  }

  const subscriber = data as CvSubscriber | null;
  const isPro = subscriber?.status === "active";

  return statusResponse({
    authenticated: true,
    status: subscriber?.status ?? null,
    trial_ends_at: subscriber?.trial_ends_at ?? null,
    days_remaining: subscriber ? daysRemaining(subscriber) : null,
    plan: subscriber?.plan ?? null,
    is_pro: isPro,
    can_use_paste_link: isPro,
  });
}
