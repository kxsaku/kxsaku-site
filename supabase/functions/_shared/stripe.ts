// supabase/functions/_shared/stripe.ts
// Shared Stripe API helper

import { getEnv } from "./env.ts";

/**
 * Make a POST request to the Stripe API.
 *
 * @param path - The Stripe API path (e.g., "checkout/sessions")
 * @param params - URL-encoded parameters
 * @returns The parsed JSON response from Stripe
 * @throws Error if the Stripe request fails
 */
export async function stripePost(path: string, params: URLSearchParams): Promise<unknown> {
  const sk = getEnv("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe error (${res.status}): ${JSON.stringify(data)}`);
  return data;
}
