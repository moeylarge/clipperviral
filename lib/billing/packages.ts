export type VisitPackId = "bronze" | "silver" | "gold" | "custom";

export type VisitPack = {
  id: VisitPackId;
  name: string;
  coinAmount: number;
  priceCents: number;
  creditedCents: number;
  minutesLabel: string;
  description: string;
  highlighted?: boolean;
};

export const VISIT_RATE_CENTS_PER_MINUTE = 199;
export const CUSTOM_MINIMUM_CENTS = 499;

export const FIXED_VISIT_PACKS: VisitPack[] = [
  {
    id: "bronze",
    name: "600 Gold Coins",
    coinAmount: 600,
    priceCents: 999,
    creditedCents: 6 * VISIT_RATE_CENTS_PER_MINUTE,
    minutesLabel: "good for 6 paid minutes",
    description: "A smaller coin bundle for one more short magical visit.",
  },
  {
    id: "silver",
    name: "1,300 Gold Coins",
    coinAmount: 1300,
    priceCents: 1999,
    creditedCents: 13 * VISIT_RATE_CENTS_PER_MINUTE,
    minutesLabel: "good for about 13 paid minutes",
    description: "A comfortable coin bundle for a longer visit or a second round later.",
  },
  {
    id: "gold",
    name: "2,800 Gold Coins",
    coinAmount: 2800,
    priceCents: 3999,
    creditedCents: 28 * VISIT_RATE_CENTS_PER_MINUTE,
    minutesLabel: "good for about 28 paid minutes",
    description: "The strongest coin value for families who want the easiest, longest continuation.",
    highlighted: true,
  },
];

export function getVisitPackById(id: string) {
  return FIXED_VISIT_PACKS.find((pack) => pack.id === id);
}

export function formatUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatGoldCoins(coins: number) {
  return `${coins.toLocaleString("en-US")} Gold Coins`;
}
