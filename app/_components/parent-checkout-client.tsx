"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CUSTOM_MINIMUM_CENTS,
  FIXED_VISIT_PACKS,
  VISIT_RATE_CENTS_PER_MINUTE,
  formatGoldCoins,
  formatUsd,
  type VisitPackId,
} from "@/lib/billing/packages";
import { useWallet } from "./fwtov-wallet-provider";

type ParentCheckoutClientProps = {
  sessionId: string;
  personaName: string;
  initialBalanceCents: number;
  sessionStatus: "active" | "paused_for_payment" | "reconnecting" | "ended";
  checkoutState?: "success" | "canceled" | null;
  checkoutSessionId?: string | null;
};

const PERSONA_ACCENT: Record<string, { ring: string; bg: string; emoji: string; leaveCopy: string }> = {
  "Santa Claus": { ring: "#e25b5b", bg: "#ffe4e0", emoji: "🎅", leaveCopy: "Santa heads back to the North Pole in" },
  "Tooth Fairy": { ring: "#c15e97", bg: "#ffe1f2", emoji: "🧚", leaveCopy: "The Tooth Fairy flies away in" },
  "Easter Bunny": { ring: "#6aa35f", bg: "#e6f4dd", emoji: "🐰", leaveCopy: "The Easter Bunny hops off in" },
};

const COUNTDOWN_START_SECONDS = 5 * 60;
const RESCUE_AMOUNT_CENTS = 499;

function packMinutes(creditedCents: number) {
  return Math.max(1, Math.round(creditedCents / VISIT_RATE_CENTS_PER_MINUTE));
}

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function ParentCheckoutClient({
  sessionId,
  personaName,
  initialBalanceCents,
  sessionStatus,
  checkoutState,
  checkoutSessionId,
}: ParentCheckoutClientProps) {
  const router = useRouter();
  const { refreshWallet } = useWallet();
  const [selectedPack, setSelectedPack] = useState<VisitPackId>("gold");
  const [customAmount, setCustomAmount] = useState("5.00");
  const [showCustom, setShowCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [balanceCents, setBalanceCents] = useState(initialBalanceCents);
  const [notice, setNotice] = useState<string | null>(
    checkoutState === "canceled" ? "Checkout canceled. The visit is still paused." : null,
  );
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_START_SECONDS);

  const accent =
    PERSONA_ACCENT[personaName] ??
    { ring: "#6a5fa9", bg: "#ece7fb", emoji: "✨", leaveCopy: "The visit closes in" };

  const isPaused = sessionStatus === "paused_for_payment";

  useEffect(() => {
    if (!isPaused) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isPaused]);

  const selectedPackObject = useMemo(
    () => FIXED_VISIT_PACKS.find((item) => item.id === selectedPack),
    [selectedPack],
  );

  const activeCents = useMemo(() => {
    if (selectedPack === "custom") {
      return Math.max(CUSTOM_MINIMUM_CENTS, Math.round(Number(customAmount || "0") * 100));
    }
    return selectedPackObject?.priceCents ?? 0;
  }, [selectedPack, selectedPackObject, customAmount]);

  const ctaLabel = useMemo(() => {
    if (busy) return "Opening secure checkout…";
    return "Purchase Now";
  }, [busy]);

  const ctaSubLabel = useMemo(() => {
    if (!activeCents) return null;
    return `Charge ${formatUsd(activeCents)} · Cancel anytime`;
  }, [activeCents]);

  useEffect(() => {
    if (!(checkoutState === "success" && checkoutSessionId)) return;

    let cancelled = false;
    setBusy(true);
    setNotice("Confirming payment and resuming the visit…");

    void (async () => {
      const response = await fetch("/api/billing/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId }),
      });

      const payload = (await response.json()) as { ok?: boolean; balanceCents?: number; error?: string };
      if (cancelled) return;

      if (!response.ok || !payload.ok) {
        setBusy(false);
        setNotice(payload.error ?? "Payment was received, but the visit could not resume yet.");
        return;
      }

      setBalanceCents(payload.balanceCents ?? balanceCents);
      void refreshWallet();
      setNotice("Payment received. Returning to the visit…");

      setTimeout(() => {
        router.replace(`/session/${sessionId}?resume=1`);
      }, 900);
    })();

    return () => {
      cancelled = true;
    };
  }, [balanceCents, checkoutSessionId, checkoutState, refreshWallet, router, sessionId]);

  async function startCheckout() {
    setBusy(true);
    setNotice(null);

    const body =
      selectedPack === "custom"
        ? {
            sessionId,
            packageId: "custom",
            customAmountCents: Math.max(CUSTOM_MINIMUM_CENTS, Math.round(Number(customAmount || "0") * 100)),
          }
        : {
            sessionId,
            packageId: selectedPack,
          };

    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };

    if (!response.ok || !payload.url) {
      setBusy(false);
      setNotice(payload.error ?? "Unable to start checkout.");
      return;
    }

    window.location.href = payload.url;
  }

  function selectRescue() {
    setSelectedPack("custom");
    setShowCustom(false);
    setCustomAmount((RESCUE_AMOUNT_CENTS / 100).toFixed(2));
  }

  const statusCopy = isPaused
    ? "Visit paused for payment"
    : sessionStatus === "active"
      ? "Visit active"
      : sessionStatus === "reconnecting"
        ? "Reconnecting…"
        : "Visit ended";

  const countdownRunning = isPaused && secondsLeft > 0;
  const countdownExpired = isPaused && secondsLeft <= 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-10 pb-28 sm:px-6 sm:py-14 sm:pb-14">
      {/* Hero: who's waiting */}
      <section className="relative z-10 rounded-[32px] border border-[#ecddf5] bg-[linear-gradient(180deg,#fffafd_0%,#fdf3fb_100%)] p-6 shadow-[0_36px_100px_-58px_rgba(67,61,123,0.28)] sm:p-8">
        <div className="pointer-events-none absolute inset-y-0 -left-24 -right-24 z-20 hidden lg:block xl:-left-36 xl:-right-36" aria-hidden>
          <div className="checkout-border-cast checkout-border-cast-left hero-cast-shell bg-white/46 p-2">
            <span className="hero-prop hero-prop-sparkle left-2 top-9 h-4 w-4 bg-[#ffe171]" />
            <span className="hero-prop hero-prop-sparkle-delayed right-3 top-4 h-3 w-3 bg-[#ffd0ef]" />
            <span className="hero-prop hero-prop-sparkle left-5 bottom-14 h-3 w-3 bg-[#b8d7ff]" />
            <img
              src="/avatars/toothfairy.svg"
              alt=""
              className="checkout-border-cast-body h-[150px] w-[124px] object-cover"
            />
            <div className="mt-2 text-center text-[11px] font-extrabold tracking-[0.01em] text-[#c15e97]">Tooth Fairy</div>
          </div>

          <div className="checkout-border-cast checkout-border-cast-right hero-cast-shell bg-white/46 p-2">
            <span className="hero-prop hero-prop-snow left-2 top-9 h-4 w-4 bg-white" />
            <span className="hero-prop hero-prop-snow-delayed right-3 top-5 h-5 w-5 bg-[#fff4d6]" />
            <span className="hero-prop hero-prop-snow left-8 bottom-14 h-3 w-3 bg-white" />
            <img
              src="/avatars/santa.svg"
              alt=""
              className="checkout-border-cast-body h-[175px] w-[142px] object-cover"
            />
            <div className="mt-2 text-center text-[11px] font-extrabold tracking-[0.01em] text-[#cb583c]">Santa Claus</div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl text-3xl shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)]"
            style={{
              backgroundColor: accent.bg,
              boxShadow: `0 0 0 2px ${accent.ring}22, inset 0 0 0 2px rgba(255,255,255,0.6)`,
            }}
            aria-hidden
          >
            {accent.emoji}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a7fbb]">Parent checkout</p>
            <h1 className="mt-1 truncate text-2xl font-extrabold text-[#2b2f53] sm:text-3xl">
              {personaName} is still on the line
            </h1>
          </div>
        </div>

        {isPaused ? (
          <div
            className={`mt-5 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
              countdownExpired
                ? "border-[#f0c9c1] bg-[#fff1ec]"
                : "border-[#f1dfc7] bg-[linear-gradient(90deg,#fff4e5_0%,#fff9f0_100%)]"
            }`}
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-[#b35722]">
              <span aria-hidden className="text-lg">⏳</span>
              <span className="truncate">
                {countdownExpired ? `${personaName} is about to step away` : accent.leaveCopy}
              </span>
            </div>
            <div
              className={`font-mono text-xl font-black tabular-nums ${
                countdownExpired ? "text-[#c13d2b]" : "text-[#2b2f53]"
              }`}
              aria-label="Time remaining"
            >
              {formatClock(secondsLeft)}
            </div>
          </div>
        ) : null}

        <p className="mt-5 text-[15px] leading-6 text-[#525b7e]">
          The free 45-second trial is up. Pick a pack below and the visit picks right back up — same character,
          same call, no sign-in required.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff3ec] px-3 py-1.5 text-[#b35722]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e07234]" />
            {statusCopy}
          </span>
          <span className="rounded-full bg-white/80 px-3 py-1.5 text-[#6a5fa9] ring-1 ring-[#e5def0]">
            Credit remaining: {formatUsd(balanceCents)}
          </span>
        </div>
      </section>

      {/* Social proof + safety line */}
      <section className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#ecddf5] bg-white/80 px-4 py-3 text-xs font-semibold text-[#525b7e] shadow-[0_14px_40px_-38px_rgba(67,61,123,0.22)]">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="text-base">👨‍👩‍👧‍👦</span>
          Used by <span className="font-black text-[#2b2f53]">12,000+ families</span>
        </span>
        <span className="inline-flex items-center gap-2 text-[#4a5270]">
          <span aria-hidden>🛡️</span>
          No ads. No data sold. Call ends when you say.
        </span>
      </section>

      {/* Rescue pack */}
      <button
        type="button"
        onClick={selectRescue}
        className={`relative z-10 mt-5 flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition ${
          selectedPack === "custom" && Math.round(Number(customAmount || "0") * 100) === RESCUE_AMOUNT_CENTS
            ? "border-[#e07234] bg-[linear-gradient(90deg,#fff4e5_0%,#fff9f0_100%)] shadow-[0_18px_46px_-32px_rgba(224,114,52,0.5)]"
            : "border-[#f1dfc7] bg-[#fffaf2] hover:border-[#e8c8a4]"
        }`}
      >
        <div>
          <p className="text-sm font-extrabold text-[#2b2f53]">
            ✨ Just a little longer — {formatUsd(RESCUE_AMOUNT_CENTS)}
          </p>
          <p className="mt-0.5 text-xs text-[#7a6249]">
            Low-cost rescue pack for one quick moment more.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#e07234] px-3 py-1 text-[11px] font-black uppercase tracking-wide text-white">
          Popular
        </span>
      </button>

      {/* Pack cards */}
      <section className="relative z-10 mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FIXED_VISIT_PACKS.map((pack) => {
          const selected = selectedPack === pack.id && !showCustom;
          const isBest = pack.highlighted;

          return (
            <button
              key={pack.id}
              type="button"
              onClick={() => {
                setSelectedPack(pack.id);
                setShowCustom(false);
              }}
              aria-pressed={selected}
              className={`relative rounded-[26px] border p-5 pt-6 text-left transition will-change-transform ${
                selected
                  ? isBest
                    ? "-translate-y-0.5 border-[#433d7b] bg-[linear-gradient(180deg,#f6f1ff_0%,#fffafd_100%)] shadow-[0_28px_70px_-42px_rgba(67,61,123,0.55)]"
                    : "-translate-y-0.5 border-[#6a5fa9] bg-white shadow-[0_22px_60px_-40px_rgba(67,61,123,0.38)]"
                  : isBest
                    ? "border-[#d8c9f4] bg-[linear-gradient(180deg,#fbf8ff_0%,#fffafd_100%)] shadow-[0_18px_50px_-38px_rgba(67,61,123,0.22)]"
                    : "border-[#ece6f6] bg-white/96 shadow-[0_14px_40px_-38px_rgba(67,61,123,0.18)] hover:border-[#d6cdee]"
              }`}
            >
              {isBest ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#433d7b] px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_10px_24px_-12px_rgba(67,61,123,0.6)]">
                  Best Value
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8e83bc]">{pack.name}</p>
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-[#433d7b] bg-[#433d7b]" : "border-[#d1c8ea] bg-white"
                  }`}
                  aria-hidden
                >
                  {selected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
                </div>
              </div>

              <p className="mt-3 text-4xl font-black leading-none text-[#2b2f53]">{formatUsd(pack.priceCents)}</p>

              <p className="mt-3 text-xs leading-5 text-[#717994]">{pack.description}</p>
            </button>
          );
        })}
      </section>

      {/* Custom amount */}
      <section className="relative z-10 mt-4">
        {!showCustom ? (
          <button
            type="button"
            onClick={() => {
              setShowCustom(true);
              setSelectedPack("custom");
            }}
            className="group inline-flex items-center gap-2 rounded-full border border-[#d8c9f4] bg-[linear-gradient(135deg,#f6f1ff_0%,#fffafd_100%)] px-5 py-2.5 text-sm font-extrabold text-[#433d7b] shadow-[0_14px_36px_-24px_rgba(67,61,123,0.45)] transition hover:-translate-y-0.5 hover:border-[#6a5fa9] hover:shadow-[0_20px_44px_-24px_rgba(67,61,123,0.55)]"
          >
            <span aria-hidden className="text-base">💜</span>
            Custom Amount
            <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
          </button>
        ) : (
          <div className="rounded-[22px] border border-[#ead7f4] bg-white/90 p-4 shadow-[0_14px_40px_-38px_rgba(67,61,123,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-[#2b2f53]">Custom amount</p>
                <p className="mt-0.5 text-xs text-[#717994]">
                  Minimum {formatUsd(CUSTOM_MINIMUM_CENTS)}. Credit matches the amount entered at the standard rate.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-extrabold text-[#6a5fa9]">$</span>
                <input
                  value={customAmount}
                  onChange={(event) => {
                    setSelectedPack("custom");
                    setCustomAmount(event.target.value);
                  }}
                  inputMode="decimal"
                  autoFocus
                  aria-label="Custom amount in USD"
                  className="w-24 rounded-xl border border-[#d8d1ed] bg-white px-3 py-2 text-right text-sm font-extrabold text-[#2b2f53] outline-none focus:border-[#6a5fa9]"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCustom(false);
                setSelectedPack("gold");
              }}
              className="mt-3 text-xs font-bold text-[#8a7fbb] underline underline-offset-4 hover:text-[#433d7b]"
            >
              Use a pack instead
            </button>
          </div>
        )}
      </section>

      {/* Mini testimonials */}
      <section className="relative z-10 mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <figure className="rounded-2xl border border-[#ecddf5] bg-white/90 p-4 shadow-[0_14px_40px_-38px_rgba(67,61,123,0.22)]">
          <blockquote className="text-sm leading-5 text-[#2b2f53]">
            “My 5-year-old cried happy tears.”
          </blockquote>
          <figcaption className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[#8a7fbb]">
            — Sarah, Ohio
          </figcaption>
        </figure>
        <figure className="rounded-2xl border border-[#ecddf5] bg-white/90 p-4 shadow-[0_14px_40px_-38px_rgba(67,61,123,0.22)]">
          <blockquote className="text-sm leading-5 text-[#2b2f53]">
            “Worth every penny — she believed it was really Santa.”
          </blockquote>
          <figcaption className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[#8a7fbb]">
            — Jessica, Austin
          </figcaption>
        </figure>
      </section>

      {/* CTA */}
      <section className="relative z-10 mt-6 rounded-[28px] border border-[#e7dcee] bg-white/90 p-5 shadow-[0_22px_60px_-38px_rgba(67,61,123,0.3)] sm:p-6">
        <button
          type="button"
          disabled={busy}
          onClick={startCheckout}
          className="group flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[linear-gradient(135deg,#433d7b_0%,#6a5fa9_100%)] px-6 py-4 text-center font-extrabold tracking-wide text-white shadow-[0_26px_60px_-28px_rgba(67,61,123,0.6)] transition hover:brightness-110 disabled:opacity-60"
        >
          <span className="text-base sm:text-lg">{ctaLabel}</span>
          <span aria-hidden className="text-xl transition group-hover:translate-x-0.5">→</span>
        </button>

        {ctaSubLabel ? (
          <p className="mt-3 text-center text-xs font-semibold text-[#7b829d]">{ctaSubLabel}</p>
        ) : null}

        {/* Express pay + brand marks */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ef] bg-white px-2.5 py-1.5 shadow-sm" aria-label="Apple Pay">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="#000" aria-hidden>
              <path d="M17.6 13.1c0-2.1 1.7-3.1 1.8-3.1-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.2.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.2-2.3 1.2-2.4-.1 0-2.5-1-2.5-3.6zM15.5 6.7c.6-.7 1-1.7.9-2.7-.8 0-1.9.6-2.5 1.2-.5.6-1 1.6-.9 2.6.9.1 1.9-.5 2.5-1.1z"/>
            </svg>
            <span className="text-[11px] font-bold text-[#1a1f36]">Pay</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ef] bg-white px-2.5 py-1.5 shadow-sm" aria-label="Google Pay">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M12.2 10.5v3.1h4.3c-.2 1-.7 1.9-1.6 2.5l2.5 1.9c1.5-1.4 2.3-3.4 2.3-5.8 0-.6-.1-1.2-.2-1.7z"/>
              <path fill="#34A853" d="M7.7 13.8l-.5.4-2 1.5c1.2 2.5 3.8 4.2 6.8 4.2 2.1 0 3.8-.7 5.1-1.8l-2.5-1.9c-.7.5-1.5.7-2.6.7-2 0-3.7-1.3-4.3-3.1z"/>
              <path fill="#FBBC04" d="M5.2 8.3C4.4 9.4 4 10.7 4 12s.4 2.6 1.2 3.7c0 0 2.5-1.9 2.5-1.9-.2-.5-.3-1.1-.3-1.8s.1-1.3.3-1.8z"/>
              <path fill="#EA4335" d="M12.2 6.9c1.2 0 2.2.4 3 1.2l2.2-2.2C16 4.6 14.3 4 12.2 4 9.2 4 6.6 5.7 5.2 8.3L7.7 10.2c.6-1.8 2.3-3.3 4.5-3.3z"/>
            </svg>
            <span className="text-[11px] font-bold text-[#1a1f36]">Pay</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4e7ef] bg-white px-2.5 py-1.5 shadow-sm" aria-label="Powered by Stripe">
            <svg viewBox="0 0 60 25" className="h-3.5 w-auto" aria-hidden>
              <path fill="#635BFF" d="M59.5 12.9c0-4.3-2.1-7.6-6-7.6s-6.4 3.4-6.4 7.6c0 5 2.8 7.5 6.9 7.5 2 0 3.5-.5 4.6-1.1v-3.3c-1.1.6-2.4 1-4 1-1.6 0-3-.6-3.2-2.5h8c.1-.2.1-1 .1-1.6zm-8.1-1.6c0-1.8 1.1-2.5 2.1-2.5s2 .7 2 2.5h-4.1zM41.6 5.3c-1.7 0-2.8.8-3.4 1.4l-.2-1.1H34v20l4.2-.9.1-4.9c.6.4 1.5 1.1 3.1 1.1 3.1 0 6-2.5 6-7.9 0-5-2.9-7.7-5.8-7.7zM40.6 16.8c-1 0-1.6-.4-2-.9v-6.7c.4-.5 1-.9 2-.9 1.6 0 2.7 1.8 2.7 4.2 0 2.5-1.1 4.3-2.7 4.3zM28.4 4.3L32.6 3.4v-3.4l-4.2.9v3.4zM28.4 5.6h4.2v14.4h-4.2zM23.8 6.8l-.3-1.2H20v14.4h4.2V10.2c1-1.3 2.7-1.1 3.2-.9V5.6c-.5-.2-2.5-.5-3.6 1.2zM15.5 2l-4.1.9v13.5c0 2.5 1.9 4.3 4.4 4.3 1.4 0 2.4-.3 3-.6v-3.4c-.5.2-3.2 1-3.2-1.5V9.2h3.2V5.6h-3.2V2zM4.6 9.7c0-.7.5-.9 1.4-.9 1.2 0 2.8.4 4 1V5.9c-1.3-.5-2.6-.7-4-.7C2.7 5.2 0 6.9 0 9.9c0 4.6 6.4 3.9 6.4 5.9 0 .8-.7 1-1.6 1-1.3 0-3.1-.5-4.4-1.3v4c1.4.6 2.9.9 4.4.9 3.4 0 6.2-1.7 6.2-4.7-.1-5-6.4-4.1-6.4-6z"/>
            </svg>
          </span>
        </div>
        <p className="mt-2 text-center text-[11px] font-bold text-[#6a5fa9]">
          One-tap express checkout on the next screen
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-[#8a91ac]">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>🔒</span> Secure checkout by Stripe
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>↩️</span> Full refund on unused minutes
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>⏱</span> End the visit anytime
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>👨‍👩‍👧</span> Parent confirms before extra time
          </span>
        </div>

        {notice ? (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-[#f0e6d2] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#7a5b2b]"
          >
            {notice}
          </div>
        ) : null}
      </section>

      {/* Gold Coins note */}
      <p className="relative z-10 mt-5 text-center text-[11px] font-semibold text-[#9ca3bd]">
        {selectedPackObject && selectedPack !== "custom"
          ? `Includes ${formatGoldCoins(selectedPackObject.coinAmount)} applied to this visit.`
          : "Custom amounts apply credit directly at the standard visit rate."}
      </p>

      {/* Sticky mobile CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ecddf5] bg-white/95 px-4 py-3 shadow-[0_-18px_40px_-30px_rgba(67,61,123,0.45)] backdrop-blur sm:hidden"
        role="region"
        aria-label="Continue checkout"
      >
        <button
          type="button"
          disabled={busy}
          onClick={startCheckout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#433d7b_0%,#6a5fa9_100%)] px-5 py-3.5 text-center text-sm font-extrabold tracking-wide text-white shadow-[0_18px_40px_-22px_rgba(67,61,123,0.6)] disabled:opacity-60"
        >
          <span className="truncate">{ctaLabel}</span>
          {countdownRunning ? (
            <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 font-mono text-xs tabular-nums">
              {formatClock(secondsLeft)}
            </span>
          ) : null}
        </button>
      </div>
    </main>
  );
}
