"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, FormEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AuthIntent = {
  intent: "start_session";
  personaSlug?: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  openAuth: (intent?: AuthIntent) => void;
  closeAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function nextPathForIntent(intent: AuthIntent | null) {
  if (intent?.intent === "start_session" && intent.personaSlug) {
    return `/?start=${encodeURIComponent(intent.personaSlug)}`;
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function FwtovAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [intent, setIntent] = useState<AuthIntent | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("Enter your email and we will send a magic link.");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const supabase = useMemo(() => createBrowserSupabaseClient(), []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  const openAuth = useCallback((nextIntent?: AuthIntent) => {
    setIntent(nextIntent ?? null);
    setError("");
    setMessage("Enter your email and we will send a magic link.");
    setModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    if (submitting) return;
    setModalOpen(false);
  }, [submitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("Sending your magic link...");

    try {
      const next = nextPathForIntent(intent);
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (otpError) {
        setError(otpError.message);
        setMessage("The magic link could not be sent.");
        return;
      }

      setMessage("Check your inbox. The link will bring you right back here.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The magic link could not be sent.");
      setMessage("The magic link could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      openAuth,
      closeAuth,
    }),
    [closeAuth, loading, openAuth, user],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#231d3d]/38 px-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_30px_80px_rgba(65,45,94,0.24)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#a47144]">Parent sign-in</p>
                <h2 className="mt-2 text-3xl font-semibold text-[#2b2f53]">Start with your email</h2>
              </div>
              <button
                type="button"
                onClick={closeAuth}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#eaddea] text-lg font-bold text-[#536186] transition hover:bg-[#fff7fc]"
                aria-label="Close sign-in"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm leading-6 text-[#5d6587]">
              We use this to keep Gold Coins and visits on the right parent account.
            </p>

            <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="text-sm font-bold text-[#2b2f53]">Email address</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-12 rounded-[18px] border border-[#eaddea] bg-[#fffafe] px-4 text-base font-semibold text-[#2b2f53] outline-none transition focus:border-[#9286dd] focus:ring-4 focus:ring-[#9286dd]/14"
                  placeholder="parent@example.com"
                  autoComplete="email"
                />
              </label>

              <p className="rounded-[18px] border border-[#f0dfca] bg-[#fff8ef] px-4 py-3 text-sm font-bold leading-6 text-[#9a653b]" role="status" aria-live="polite">
                {message}
              </p>

              {error ? <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}

              <button
                type="submit"
                disabled={submitting}
                className="min-h-13 rounded-full bg-[#2f357f] px-6 py-4 text-base font-extrabold text-white shadow-[0_16px_40px_rgba(47,53,127,0.25)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Send magic link"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}

export function useFwtovAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useFwtovAuth must be used inside FwtovAuthProvider");
  }

  return context;
}
