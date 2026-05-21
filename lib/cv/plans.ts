export const CV_PLANS = {
  monthly: {
    priceId: process.env.STRIPE_PRICE_CV_PRO_MONTHLY!,
    label: "Monthly",
    amountCents: 1900,
    interval: "month" as const,
  },
  annual: {
    priceId: process.env.STRIPE_PRICE_CV_PRO_ANNUAL!,
    label: "Annual",
    amountCents: 19000,
    interval: "year" as const,
  },
};

export type CvPlanId = "monthly" | "annual";

export function getCvPlan(id: CvPlanId) {
  return CV_PLANS[id];
}
