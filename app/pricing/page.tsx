import Link from "next/link";

import type { CvSubscriber } from "@/lib/cv/subscriber";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { PricingButtons } from "./pricing-buttons";

export const dynamic = "force-dynamic";

type PricingPageProps = {
  searchParams?: Promise<{ reason?: string }>;
};

function getReasonMessage(reason?: string) {
  if (reason === "trial_expired") {
    return "Your free trial has ended. Pick a plan to keep going.";
  }

  if (reason === "payment_failed") {
    return "Your last payment didn't go through. Update billing to resume access.";
  }

  return null;
}

async function getSubscriber(authUserId: string): Promise<CvSubscriber | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("cv_subscribers")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as CvSubscriber;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const params = await searchParams;
  const reasonMessage = getReasonMessage(params?.reason);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const subscriber = user ? await getSubscriber(user.id) : null;

  return (
    <main className="min-h-screen bg-[#fafafa] px-4 py-10 text-[#1d1d1f] sm:px-6">
      <div className="mx-auto grid w-full max-w-4xl gap-8">
        <div className="grid gap-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1d1d1f] text-xl font-black text-white">
            CV
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">ClipperViral Pro</h1>
          <p className="mx-auto max-w-xl text-sm leading-6 text-[#6e6e73]">
            7-day free trial when you sign up. Pick a plan when you&apos;re ready.
          </p>
        </div>

        {reasonMessage ? (
          <p className="rounded-2xl border border-[#e35de0]/14 bg-[#fff8fe] px-4 py-3 text-center text-sm font-semibold leading-6 text-[#6e6e73]">
            {reasonMessage}
          </p>
        ) : null}

        {!user ? (
          <section className="mx-auto grid w-full max-w-md gap-5 rounded-2xl border border-black/[0.06] bg-white p-6 text-center shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
            <h2 className="text-2xl font-semibold tracking-tight">Start with your free trial</h2>
            <p className="text-sm leading-6 text-[#6e6e73]">
              Sign in with Google to unlock the editor and start your 7-day trial.
            </p>
            <Link
              href="/login?next=/pricing"
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-sm font-bold text-white transition hover:bg-black"
            >
              Sign in to start your free trial
            </Link>
          </section>
        ) : (
          <PricingButtons showPortal={Boolean(subscriber?.stripe_customer_id)} />
        )}
      </div>
    </main>
  );
}
