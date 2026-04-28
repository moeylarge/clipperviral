import { VISIT_RATE_CENTS_PER_MINUTE } from "@/lib/billing/packages";

export const GOLD_COINS_PER_PAID_MINUTE = 100;

export type WalletSummary = {
  userDbId: string;
  externalUserId: string;
  email: string | null;
  balanceCents: number;
  goldCoins: number;
  rateCentsPerMinute: number;
  coinsPerPaidMinute: number;
  updatedAt: string | null;
};

export function centsToGoldCoins(cents: number) {
  return Math.floor((Math.max(0, cents) * GOLD_COINS_PER_PAID_MINUTE) / VISIT_RATE_CENTS_PER_MINUTE);
}
