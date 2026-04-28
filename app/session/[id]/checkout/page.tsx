import { notFound, redirect } from "next/navigation";

import { ParentCheckoutClient } from "@/app/_components/parent-checkout-client";
import { requireFwtovUserForRequest } from "@/lib/auth/fwtov-user";
import { getSessionCheckoutContext } from "@/lib/session/store";

export default async function SessionCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string; checkout_session_id?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;

  let user;
  try {
    user = await requireFwtovUserForRequest();
  } catch {
    redirect(`/?auth=required`);
  }

  const checkoutContext = await getSessionCheckoutContext(id);
  if (!checkoutContext) notFound();

  if (checkoutContext.userDbId !== user.id) {
    notFound();
  }

  if (checkoutContext.session.status === "ended") {
    redirect(`/session/${id}/end`);
  }

  const checkoutState = resolvedSearch.checkout === "success" || resolvedSearch.checkout === "canceled" ? resolvedSearch.checkout : null;

  return (
    <ParentCheckoutClient
      sessionId={id}
      personaName={checkoutContext.personaName}
      initialBalanceCents={checkoutContext.balanceCents}
      sessionStatus={checkoutContext.session.status}
      checkoutState={checkoutState}
      checkoutSessionId={resolvedSearch.checkout_session_id ?? null}
    />
  );
}
