"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const oauthCallbackError = searchParams.get("error") === "oauth_callback_failed";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);
    setError("");
    try {
      const supabase = createBrowserSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        return;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setError("Google sign-in did not return a redirect URL.");
    } catch (oauthUnexpectedError) {
      setError(
        oauthUnexpectedError instanceof Error
          ? oauthUnexpectedError.message
          : "Google sign-in failed unexpectedly."
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        disabled={isGoogleSubmitting || isSubmitting}
        onClick={handleGoogleSignIn}
      >
        {isGoogleSubmitting ? "Redirecting to Google..." : "Continue with Google"}
      </Button>

      {oauthCallbackError ? (
        <p className="text-sm text-rose-600">
          Google OAuth callback failed. Check Supabase Google provider redirect settings and try again.
        </p>
      ) : null}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="bg-white px-2">Or use email</span>
        </div>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm text-foreground"
            placeholder="you@clipperviral.com"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-xs uppercase tracking-[0.14em] text-muted-foreground" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 rounded-md border border-border bg-white px-3 text-sm text-foreground"
            placeholder="Your password"
          />
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <Button type="submit" size="sm" className="w-full" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Existing users only (Supabase auth). Add your own sign-up flow in next pass.
        </p>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </form>
    </div>
  );
}
