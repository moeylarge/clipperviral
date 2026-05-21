import { NextResponse } from "next/server";

import type { CvSubscriber } from "@/lib/cv/subscriber";
import { getCvStripe } from "@/lib/cv/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("cv_subscribers")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const subscriber = data as CvSubscriber | null;
    if (!subscriber?.stripe_customer_id) {
      return NextResponse.json({ error: "No active billing customer." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const session = await getCvStripe().billingPortal.sessions.create({
      customer: subscriber.stripe_customer_id,
      return_url: `${origin}/editor.html`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
