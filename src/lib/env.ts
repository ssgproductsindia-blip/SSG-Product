import { z } from 'zod';

/**
 * Environment configuration.
 *
 * Two separate schemas, deliberately. `publicEnv` holds values that are
 * compiled into the browser bundle and are therefore public by definition.
 * `serverEnv()` holds secrets and is a function, not a constant, so that a
 * stray import from a client component fails at build time instead of
 * quietly shipping a service-role key to the browser.
 *
 * Supabase renamed its keys: the dashboard now issues a *publishable* key
 * (formerly "anon") and a *secret* key (formerly "service_role"). Both naming
 * generations are accepted here so an older project's keys still work.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: 'NEXT_PUBLIC_SUPABASE_URL must be the full https URL of your Supabase project.',
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, {
    message: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing. Copy it from Supabase → Project Settings → API.',
  }),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),

  // Razorpay's Key ID is not a secret — it is meant to be embedded in the
  // client-side Checkout widget, the same way a Stripe publishable key is.
  // Only the Key SECRET (server-only, below) can create charges or sign
  // anything; this one alone cannot. It is declared here, separately from
  // RAZORPAY_KEY_ID in the server schema, because a browser bundle and a
  // server action are different compilation contexts — there is no way to
  // share one env var across both without the NEXT_PUBLIC_ prefix, so the
  // two are set to the SAME value in .env.local, deliberately duplicated.
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
});

/**
 * Read at module scope so Next can inline the values. These must be written
 * out longhand — `process.env[someVariable]` is not statically replaced by the
 * bundler and would be undefined in the browser.
 */
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
});

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20, {
    message:
      'SUPABASE_SECRET_KEY is missing. This is the secret (service_role) key — server-side only, never NEXT_PUBLIC_.',
  }),

  // Email. Optional at the type level so the app boots without it, but the
  // send path reports a real failure rather than pretending mail went out.
  RESEND_API_KEY: z.string().optional(),
  ORDER_EMAIL_FROM: z.string().optional(),
  ORDER_EMAIL_BCC: z.string().optional(),

  // Payments. Absent keys mean payments are OFF, not that they succeed.
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. This is a secret-leak bug, not a config problem.');
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SECRET_KEY:
        process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      ORDER_EMAIL_FROM: process.env.ORDER_EMAIL_FROM,
      ORDER_EMAIL_BCC: process.env.ORDER_EMAIL_BCC,
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
      RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    });
  }
  return cachedServerEnv;
}

/**
 * Feature availability, derived from which secrets are actually present.
 *
 * These exist so the UI can tell the truth about the system's current state:
 * an unconfigured mailer produces a visible "email not sent" outcome, and an
 * unconfigured gateway produces an order that is honestly marked unpaid,
 * rather than either one silently reporting success.
 */
export function emailConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.RESEND_API_KEY && env.ORDER_EMAIL_FROM);
}

/**
 * True only when the server can both create a Razorpay order (KEY_ID +
 * KEY_SECRET) and the browser has the matching public key to open the
 * Checkout widget for it. Requiring the public key here too, and requiring
 * it to be the SAME value as the server one, catches the classic
 * misconfiguration of setting one and forgetting the other — that failure
 * mode would otherwise surface as a confusing widget error deep into
 * checkout instead of a clean "payments not configured" state up front.
 */
export function paymentsConfigured(): boolean {
  const env = serverEnv();
  return Boolean(
    env.RAZORPAY_KEY_ID &&
      env.RAZORPAY_KEY_SECRET &&
      publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID &&
      publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID === env.RAZORPAY_KEY_ID,
  );
}
