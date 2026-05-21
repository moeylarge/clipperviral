"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

function LoginPanel() {
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const errorCode = searchParams.get("error");
  const errorMessage = searchParams.get("message");

  async function handleGoogleSignIn() {
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (signInError) {
        setError(signInError.message || "Google sign-in could not start.");
        setIsSubmitting(false);
      }
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Google sign-in could not start.");
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
      <div className="grid gap-5">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)] px-5 text-base font-bold text-white shadow-[0_18px_42px_rgba(227,93,224,0.34)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-black text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]">G</span>
          {isSubmitting ? "Opening Google..." : "Sign in with Google"}
        </button>

        {error || errorCode ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
            {error || errorMessage || "Sign-in could not complete. Please try again."}
          </p>
        ) : (
          <p className="rounded-2xl border border-[#e35de0]/14 bg-[#fff8fe] px-4 py-3 text-sm font-semibold leading-6 text-[#6e6e73]">
            Sign in with Google to start your 7-day free trial. No credit card required.
          </p>
        )}
      </div>
    </section>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] px-4 py-10 text-[#1d1d1f] sm:px-6">
      <div className="mx-auto grid w-full max-w-md gap-6">
        <div className="grid gap-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1d1d1f] text-xl font-black text-white">
            CV
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">ClipperViral</h1>
          <p className="text-sm leading-6 text-[#6e6e73]">
            Sign in with Google to start your 7-day free trial. No credit card required.
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-[#6e6e73]">Loading sign-in...</p>}>
          <LoginPanel />
        </Suspense>
      </div>
    </main>
  );
}
