"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { WalletSummary } from "@/lib/billing/wallet";
import { useFwtovAuth } from "./fwtov-auth-provider";

type WalletContextValue = {
  wallet: WalletSummary | null;
  loading: boolean;
  error: string;
  refreshWallet: () => Promise<WalletSummary | null>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function FwtovWalletProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useFwtovAuth();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshWallet = useCallback(async () => {
    if (!user) {
      setWallet(null);
      setError("");
      return null;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/billing/balance", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { wallet?: WalletSummary; error?: string } | null;

      if (!response.ok || !payload?.wallet) {
        throw new Error(payload?.error ?? "Wallet could not be loaded.");
      }

      setWallet(payload.wallet);
      return payload.wallet;
    } catch (walletError) {
      const message = walletError instanceof Error ? walletError.message : "Wallet could not be loaded.";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refreshWallet();
  }, [authLoading, refreshWallet]);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallet,
      loading,
      error,
      refreshWallet,
    }),
    [error, loading, refreshWallet, wallet],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside FwtovWalletProvider");
  }

  return context;
}
