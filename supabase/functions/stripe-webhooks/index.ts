// supabase/functions/stripe-webhooks/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function computeHmacSHA256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Minimal Stripe signature verification for v1
async function verifyStripeSignature(req: Request, body: string) {
  const secret = getEnv("STRIPE_WEBHOOK_SECRET"); // whsec_...
  const sigHeader = req.headers.get("stripe-signature") ?? "";

  const parts = sigHeader.split(",").map((p) => p.trim());
  const tPart = parts.find((p) => p.startsWith("t="));
  const v1Part = parts.find((p) => p.startsWith("v1="));
  if (!tPart || !v1Part) throw new Error("Missing Stripe signature parts.");

  const t = tPart.slice(2);
  const v1 = v1Part.slice(3);

  const signedPayload = `${t}.${body}`;
  const expected = await computeHmacSHA256Hex(secret, signedPayload);

  if (!timingSafeEqual(expected, v1)) throw new Error("Invalid Stripe signature.");
}

serve(async (req) => {
  try {
    const SB_URL = getEnv("SB_URL");
    const SB_SERVICE_ROLE_KEY = getEnv("SB_SERVICE_ROLE_KEY");

    const body = await req.text();
    await verifyStripeSignature(req, body);

    const event = JSON.parse(body);
    const type = event.type as string;

    console.log("stripe-webhooks:", type);

    const sb = createClient(SB_URL, SB_SERVICE_ROLE_KEY);

    const upsertByCustomer = async (stripeCustomerId: string, patch: Record<string, unknown>) => {
      const { data: row, error } = await sb
        .from("billing_subscriptions")
        .select("user_id,email,stripe_customer_id")
        .eq("stripe_customer_id", stripeCustomerId)
        .maybeSingle();

      if (error) throw error;
      if (!row?.user_id) return;

      const { error: upErr } = await sb.from("billing_subscriptions").upsert({
        user_id: row.user_id,
        email: row.email,
        stripe_customer_id: stripeCustomerId,
        ...patch,
      });

      if (upErr) throw upErr;
    };

    switch (type) {


    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Only relevant for subscription checkout
      if (session.mode !== "subscription") break;

      const userId = session.client_reference_id || session.metadata?.user_id;
      const email = session.customer_details?.email || session.metadata?.email;

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;

      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!userId || !customerId || !subscriptionId) {
        // Not enough info to link to a user row
        break;
      }

      // Fetch the subscription from Stripe so we get status + current_period_end
      const sub = await stripe.subscriptions.retrieve(subscriptionId);

      await upsertSubscription(
        userId,
        email || "",
        customerId,
        sub
      );

      break;
    }

    default:
      break;
    }

    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated" ||
      type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object;
      const customer = sub.customer as string;
      const status = sub.status as string;
      const cancelAtPeriodEnd = !!obj.cancel_at_period_end;

      const itemPeriodEnd = obj.items?.data?.[0]?.current_period_end ?? null;
      const rawPeriodEnd = obj.current_period_end ?? itemPeriodEnd;

      const currentPeriodEnd = rawPeriodEnd
        ? new Date(rawPeriodEnd * 1000).toISOString()
        : null;

      await upsertByCustomer(stripeCustomerId, {
        status: obj.status,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: currentPeriodEnd,
      });




    }

    if (type === "invoice.payment_succeeded" || type === "invoice_payment_succeeded") {
      const inv = event.data.object;

      const stripeCustomerId = inv.customer as string | null;
      if (stripeCustomerId) {
        const amount =
          typeof inv.amount_paid === "number" ? inv.amount_paid :
          typeof inv.amount_due === "number" ? inv.amount_due :
          null;

        const paidAt =
          inv.status_transitions?.paid_at
            ? new Date(inv.status_transitions.paid_at * 1000).toISOString()
            : null;

        await upsertByCustomer(stripeCustomerId, {
          last_payment_status: "paid",
          last_payment_amount: amount != null ? amount / 100 : null,
          last_payment_currency: (inv.currency ?? null),
          last_payment_at: paidAt,
        });
      }
    }

    if (type === "invoice.payment_failed" || type === "invoice_payment_failed") {
      const inv = event.data.object;

      const stripeCustomerId = inv.customer as string | null;
      if (stripeCustomerId) {
        const amount =
          typeof inv.amount_due === "number" ? inv.amount_due :
          typeof inv.amount_paid === "number" ? inv.amount_paid :
          null;

        await upsertByCustomer(stripeCustomerId, {
          last_payment_status: "failed",
          last_payment_amount: amount != null ? amount / 100 : null,
          last_payment_currency: (inv.currency ?? null),
          last_payment_at: null,
        });
      }
    }


    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(`Webhook error: ${String(e?.message ?? e)}`, { status: 400 });
  }
});
