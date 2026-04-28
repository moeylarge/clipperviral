import { NextRequest, NextResponse } from "next/server";

import { requireFwtovUserForRequest } from "@/lib/auth/fwtov-user";
import { getStripe } from "@/lib/billing/stripe";
import { applyStripeWalletCredit } from "@/lib/session/store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { checkoutSessionId?: string };
    if (!body.checkoutSessionId) {
      return NextResponse.json({ error: "checkoutSessionId is required" }, { status: 400 });
    }

    const user = await requireFwtovUserForRequest();
    const stripe = getStripe();
    const checkoutSession = await stripe.checkout.sessions.retrieve(body.checkoutSessionId);

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json({ error: "checkout session not paid" }, { status: 400 });
    }

    const userDbId = checkoutSession.metadata?.userDbId;
    const creditedCents = Number(checkoutSession.metadata?.creditedCents ?? 0);
    if (!userDbId || creditedCents <= 0) {
      return NextResponse.json({ error: "checkout session metadata is incomplete" }, { status: 400 });
    }

    if (userDbId !== user.id) {
      return NextResponse.json({ error: "checkout session does not belong to signed-in user" }, { status: 403 });
    }

    const balanceCents = await applyStripeWalletCredit({
      userDbId,
      checkoutSessionId: checkoutSession.id,
      purchaseAmountCents: checkoutSession.amount_total ?? 0,
      creditedCents,
      currency: checkoutSession.currency ?? "usd",
      metadata: {
        sessionId: checkoutSession.metadata?.sessionId ?? null,
        packageId: checkoutSession.metadata?.packageId ?? null,
        packageName: checkoutSession.metadata?.packageName ?? null,
        packageValueStatement: checkoutSession.metadata?.packageValueStatement ?? null,
      },
    });

    return NextResponse.json({ ok: true, balanceCents });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: message === "sign-in is required" ? 401 : 400 });
  }
}
