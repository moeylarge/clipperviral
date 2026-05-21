"use client";

import { useState } from "react";

import type { CvPlanId } from "@/lib/cv/plans";

type LoadingAction = CvPlanId | "portal" | null;

export function PricingButtons({ showPortal }: { showPortal: boolean }) {
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [error, setError] = useState("");

  async function startCheckout(plan: CvPlanId) {
    setError("");
    setLoading(plan);

    try {
      const response = await fetch("/api/cv-billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.url) {
        throw new Error(json?.error || "Checkout could not start.");
      }

      window.location.href = json.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not start.");
      setLoading(null);
    }
  }

  async function openPortal() {
    setError("");
    setLoading("portal");

    try {
      const response = await fetch("/api/cv-billing/portal", { method: "POST" });
      const json = await response.json().catch(() => null);

      if (!response.ok || !json?.url) {
        throw new Error(json?.error || "Billing portal could not open.");
      }

      window.location.href = json.url;
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Billing portal could not open.");
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="grid gap-5 rounded-2xl border border-black/[0.06] bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
          <div className="grid gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Monthly</h2>
            <p className="text-4xl font-semibold tracking-tight">$19<span className="text-base font-medium text-[#6e6e73]">/month</span></p>
            <p className="text-sm leading-6 text-[#6e6e73]">Cancel anytime.</p>
          </div>
          <button
            type="button"
            onClick={() => startCheckout("monthly")}
            disabled={loading !== null}
            className="min-h-12 rounded-full bg-[#1d1d1f] px-5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "monthly" ? "Loading..." : "Start Monthly"}
          </button>
        </section>

        <section className="grid gap-5 rounded-2xl border border-[#1d1d1f] bg-white p-6 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
          <div className="grid gap-2">
            <span className="w-fit rounded-full bg-[#1d1d1f] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">Best value</span>
            <h2 className="text-xl font-semibold tracking-tight">Annual</h2>
            <p className="text-4xl font-semibold tracking-tight">$190<span className="text-base font-medium text-[#6e6e73]">/year</span></p>
            <p className="text-sm leading-6 text-[#6e6e73]">Save $38 — 2 months free.</p>
          </div>
          <button
            type="button"
            onClick={() => startCheckout("annual")}
            disabled={loading !== null}
            className="min-h-12 rounded-full bg-[#1d1d1f] px-5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading === "annual" ? "Loading..." : "Start Annual"}
          </button>
        </section>
      </div>

      {showPortal ? (
        <button
          type="button"
          onClick={openPortal}
          disabled={loading !== null}
          className="mx-auto text-sm font-semibold text-[#1d1d1f] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading === "portal" ? "Loading..." : "Manage billing"}
        </button>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
