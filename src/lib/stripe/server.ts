import Stripe from 'stripe';

/** Lazily-constructed Stripe client. Throws if the secret key isn't set. */
let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
  }
  if (!client) {
    // Pin to the version this SDK build ships; bump when upgrading `stripe`.
    client = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-06-24.dahlia',
    });
  }
  return client;
}
