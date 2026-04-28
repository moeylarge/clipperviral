"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const next = searchParams.get("next") || "/";
  const ownerMode = searchParams.get("owner") === "1";
  const [message, setMessage] = useState(
    ownerMode ? "Protected ops access uses the owner sign-in below." : "Use Google for the fastest access, or continue with email below.",
  );
  const [error, setError] = useState<string>("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("Checking protected access...");

    try {
      const response = await fetch("/api/auth/manual-signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || "Sign-in failed.");
        setMessage("Email access did not complete.");
        return;
      }

      router.replace(next);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
      setMessage("Email access did not complete.");
    } finally {
      setIsSubmitting(false);
    }
  };

  async function handleGoogleSignIn() {
    setError("");
    setIsGoogleSubmitting(true);
    setMessage("Opening Google sign-in...");

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (googleError) {
        setError(googleError.message || "Google sign-in could not start.");
        setMessage("Google sign-in did not start.");
        setIsGoogleSubmitting(false);
      }
    } catch (googleError) {
      setError(googleError instanceof Error ? googleError.message : "Google sign-in could not start.");
      setMessage("Google sign-in did not start.");
      setIsGoogleSubmitting(false);
    }
  }

  return (
    <div className="grid gap-5">
      {!ownerMode ? (
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleSubmitting}
          className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-full bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)] px-5 text-base font-bold text-white shadow-[0_18px_42px_rgba(227,93,224,0.34)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-sm font-black text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]">G</span>
          {isGoogleSubmitting ? "Opening Google..." : "Continue with Google"}
        </button>
      ) : null}

      <p className="rounded-2xl border border-[#e35de0]/14 bg-[#fff8fe] px-4 py-3 text-sm font-semibold leading-6 text-[#6e6e73]" role="status" aria-live="polite">
        {message}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-black/[0.08]" />
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#86868b]">{ownerMode ? "Owner access" : "Email access"}</span>
        <div className="h-px flex-1 bg-black/[0.08]" />
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[#1d1d1f]">Email address</span>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 rounded-[20px] border border-black/10 bg-[#fbfbfd] px-4 text-sm text-[#1d1d1f] shadow-[inset_0_1px_2px_rgba(29,29,31,0.04)] outline-none transition focus:border-[#e35de0]/65 focus:bg-white focus:ring-4 focus:ring-[#e35de0]/10"
            placeholder="you@clipperviral.com"
            autoComplete="email"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold text-[#1d1d1f]">Password</span>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 rounded-[20px] border border-black/10 bg-[#fbfbfd] px-4 text-sm text-[#1d1d1f] shadow-[inset_0_1px_2px_rgba(29,29,31,0.04)] outline-none transition focus:border-[#e35de0]/65 focus:bg-white focus:ring-4 focus:ring-[#e35de0]/10"
            placeholder="Your password"
            autoComplete="current-password"
          />
        </label>

        {error ? <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p> : null}

        <button
          type="submit"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-black/10 bg-white px-5 text-sm font-bold text-[#1d1d1f] shadow-[0_14px_34px_rgba(29,29,31,0.08)] transition hover:bg-[#fbfbfd] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Signing in..." : "Sign in with email"}
        </button>
      </form>
    </div>
  );
}
