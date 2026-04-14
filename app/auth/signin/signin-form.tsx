"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

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
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
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
            autoComplete="email"
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
            autoComplete="current-password"
          />
        </div>

        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

        <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>

        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Protected workspace access.</p>
        <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <Link href="/" className="text-foreground underline-offset-4 hover:underline">
            Back to ClipperViral
          </Link>
        </p>
      </form>
    </div>
  );
}
