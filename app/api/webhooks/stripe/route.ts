import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { CV_PLANS, type CvPlanId } from "@/lib/cv/plans";
import { getStripe } from "@/lib/billing/stripe";
import { applyStripeWalletCredit } from "@/lib/session/store";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CV_SUBSCRIPTION_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.payment_failed",
]);

function getStripeId(value: string | { id?: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id ?? null;
}

function getPlanIdFromPrice(priceId: string | null | undefined): CvPlanId | null {
  if (!priceId) return null;

  return (Object.entries(CV_PLANS) as Array<[CvPlanId, (typeof CV_PLANS)[CvPlanId]]>)
    .find(([, plan]) => plan.priceId === priceId)?.[0] ?? null;
}

function stripeStatusToCvStatus(status: string) {
  if (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "incomplete" ||
    status === "incomplete_expired" ||
    status === "unpaid" ||
    status === "paused"
  ) {
    return status;
  }

  return "past_due";
}

function toIsoFromUnix(unixSeconds: number | null | undefined) {
  return unixSeconds ? new Date(unixSeconds * 1000).toISOString() : null;
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const subscriptionWithPeriod = subscription as Stripe.Subscription & { current_period_end?: number | null };
  const firstItemWithPeriod = subscription.items.data[0] as
    | (Stripe.SubscriptionItem & { current_period_end?: number | null })
    | undefined;
  return subscriptionWithPeriod.current_period_end ?? firstItemWithPeriod?.current_period_end ?? null;
}

async function findCvSubscriberByCustomer(stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("cv_subscribers")
    .select("id, auth_user_id, stripe_customer_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function handleCvSubscriptionEvent(event: Stripe.Event) {
  if (!CV_SUBSCRIPTION_EVENT_TYPES.has(event.type)) return false;

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.trial_will_end"
  ) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = getStripeId(subscription.customer);
    const hasCvSource = subscription.metadata?.source === "clipperviral";
    const subscriber = await findCvSubscriberByCustomer(customerId);

    if (!hasCvSource && !subscriber) return false;

    if (event.type === "customer.subscription.trial_will_end") {
      console.log("ClipperViral Stripe trial will end", { subscriptionId: subscription.id, customerId });
      return true;
    }

    if (!customerId) {
      console.error("ClipperViral Stripe subscription event missing customer", { eventType: event.type, subscriptionId: subscription.id });
      return true;
    }

    if (event.type === "customer.subscription.deleted") {
      await getSupabaseAdmin()
        .from("cv_subscribers")
        .update({
          stripe_subscription_id: subscription.id,
          status: "canceled",
          cancel_at_period_end: true,
        })
        .eq("stripe_customer_id", customerId);
      return true;
    }

    const priceId = subscription.items.data[0]?.price?.id ?? null;
    const plan = getPlanIdFromPrice(priceId);

    await getSupabaseAdmin()
      .from("cv_subscribers")
      .update({
        stripe_subscription_id: subscription.id,
        plan,
        status: stripeStatusToCvStatus(subscription.status),
        current_period_end: toIsoFromUnix(getSubscriptionCurrentPeriodEnd(subscription)),
        cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq("stripe_customer_id", customerId);

    return true;
  }

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = getStripeId(invoice.customer);
    const invoiceWithMetadata = invoice as Stripe.Invoice & { metadata?: Stripe.Metadata | null };
    const hasCvSource = invoiceWithMetadata.metadata?.source === "clipperviral";
    const subscriber = await findCvSubscriberByCustomer(customerId);

    if (!hasCvSource && !subscriber) return false;
    if (!customerId) return true;

    await getSupabaseAdmin()
      .from("cv_subscribers")
      .update({ status: "past_due" })
      .eq("stripe_customer_id", customerId);

    return true;
  }

  return false;
}

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

    if (await handleCvSubscriptionEvent(event)) {
      return NextResponse.json({ received: true });
    }

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
