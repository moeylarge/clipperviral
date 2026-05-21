import { NextResponse } from "next/server";

import { getCvPlan, type CvPlanId } from "@/lib/cv/plans";
import type { CvSubscriber } from "@/lib/cv/subscriber";
import { getCvStripe } from "@/lib/cv/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isCvPlanId(plan: unknown): plan is CvPlanId {
  return plan === "monthly" || plan === "annual";
}

async function ensureSubscriber(authUserId: string, email: string | null): Promise<CvSubscriber> {
  const admin = getSupabaseAdmin();

  const existing = await admin
    .from("cv_subscribers")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data as CvSubscriber;
  }

  const ensured = await admin
    .rpc("ensure_cv_subscriber", {
      p_auth_user_id: authUserId,
      p_email: email ?? "",
    })
    .single();

  if (ensured.error || !ensured.data) {
    throw new Error(ensured.error?.message ?? "Unable to create subscriber.");
  }

  return ensured.data as CvSubscriber;
}

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

    const body = await request.json().catch(() => ({}));
    if (!isCvPlanId(body?.plan)) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const admin = getSupabaseAdmin();
    const stripe = getCvStripe();
    const plan = getCvPlan(body.plan);

    if (!plan.priceId) {
      return NextResponse.json({ error: "Stripe price is not configured." }, { status: 500 });
    }

    let subscriber = await ensureSubscriber(user.id, user.email ?? null);
    let stripeCustomerId = subscriber.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: {
          cv_subscriber_id: subscriber.id,
          auth_user_id: user.id,
          source: "clipperviral",
        },
      });

      stripeCustomerId = customer.id;
      const updated = await admin
        .from("cv_subscribers")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", subscriber.id)
        .select("*")
        .single();

      if (updated.error || !updated.data) {
        throw new Error(updated.error?.message ?? "Unable to store Stripe customer.");
      }

      subscriber = updated.data as CvSubscriber;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${origin}/editor.html?cv_checkout=success`,
      cancel_url: `${origin}/pricing?cv_checkout=canceled`,
      subscription_data: {
        metadata: {
          cv_subscriber_id: subscriber.id,
          auth_user_id: user.id,
          source: "clipperviral",
        },
      },
      metadata: {
        source: "clipperviral",
        plan: body.plan,
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
