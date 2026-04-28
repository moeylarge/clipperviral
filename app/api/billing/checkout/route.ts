import { NextRequest, NextResponse } from "next/server";

import { requireFwtovUserForRequest } from "@/lib/auth/fwtov-user";
import { CUSTOM_MINIMUM_CENTS, formatUsd, getVisitPackById } from "@/lib/billing/packages";
import { getStripe } from "@/lib/billing/stripe";
import { getSessionCheckoutContext } from "@/lib/session/store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      packageId?: string;
      customAmountCents?: number;
    };

    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const user = await requireFwtovUserForRequest();
    const checkoutContext = await getSessionCheckoutContext(body.sessionId);
    if (!checkoutContext) {
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }

    if (checkoutContext.userDbId !== user.id) {
      return NextResponse.json({ error: "session does not belong to signed-in user" }, { status: 403 });
    }

    if (checkoutContext.session.status === "ended") {
      return NextResponse.json({ error: "session already ended" }, { status: 400 });
    }

    let amountCents = 0;
    let creditedCents = 0;
    const packageId = body.packageId ?? "gold";
    let packageName = "";
    let packageValueStatement = "";

    if (packageId === "custom") {
      amountCents = Math.max(CUSTOM_MINIMUM_CENTS, Math.floor(body.customAmountCents ?? 0));
      creditedCents = amountCents;
      packageName = "Choose Your Own Amount";
      packageValueStatement = `Adds ${formatUsd(creditedCents)} in visit credit`;
    } else {
      const selected = getVisitPackById(packageId);
      if (!selected) {
        return NextResponse.json({ error: "invalid package" }, { status: 400 });
      }
      amountCents = selected.priceCents;
      creditedCents = selected.creditedCents;
      packageName = selected.name;
      packageValueStatement = `${formatUsd(selected.priceCents)} — ${selected.minutesLabel}`;
    }

    const origin = request.nextUrl.origin;
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/session/${body.sessionId}/checkout?checkout=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/session/${body.sessionId}/checkout?checkout=canceled`,
      metadata: {
        sessionId: body.sessionId,
        userDbId: checkoutContext.userDbId,
        externalUserId: checkoutContext.externalUserId,
        packageId,
        creditedCents: String(creditedCents),
        packageName,
        packageValueStatement,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: packageName,
              description:
                packageId === "custom"
                  ? "Parent-managed visit credit for a resumed magical character call."
                  : packageValueStatement,
            },
          },
        },
      ],
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    const message = (error as Error).message;
    return NextResponse.json({ error: message }, { status: message === "sign-in is required" ? 401 : 400 });
  }
}
