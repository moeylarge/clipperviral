import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getStripe } from "@/lib/billing/stripe";
import { applyStripeWalletCredit } from "@/lib/session/store";

export async function POST(request: Request) {
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "missing stripe webhook secret" }, { status: 500 });
  }

  try {
    const payload = await request.text();
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object;
      const userDbId = checkoutSession.metadata?.userDbId;
      const creditedCents = Number(checkoutSession.metadata?.creditedCents ?? 0);

      if (checkoutSession.payment_status === "paid" && userDbId && creditedCents > 0) {
        await applyStripeWalletCredit({
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
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
