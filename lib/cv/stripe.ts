import Stripe from "stripe";

let cached: Stripe | null = null;

export function getCvStripe() {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY missing");
  }

  cached = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  return cached;
}
