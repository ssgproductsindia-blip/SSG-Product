import 'server-only';

/**
 * Fixed-window rate limiting.
 *
 * IMPORTANT LIMITATION, stated plainly because getting this wrong is a
 * security problem rather than a performance one: this counter lives in the
 * memory of one server instance. On Vercel, requests are spread across
 * instances that do not share memory, and instances are recycled. So the real
 * effective limit is roughly (configured limit x number of live instances),
 * and it resets whenever an instance does.
 *
 * That makes this useful against casual abuse — a stuck retry loop, someone
 * hammering the order-tracking form by hand — and NOT sufficient against a
 * determined distributed attacker.
 *
 * Before taking real volume, back this with Redis (Upstash works well on
 * Vercel) or Vercel's own firewall rules. The call sites are already in the
 * right places; only this implementation needs replacing.
 *
 * What actually protects the data does not depend on this at all: order
 * lookups require the order number AND the matching contact, checked inside
 * lookup_order(), and order totals are computed server-side. Rate limiting
 * raises the cost of guessing; it is not what makes guessing fail.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stop the Map growing without bound in a long-lived instance. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  retryAfter: number;
};

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfter: 0 };
}

/**
 * Best-effort client identifier from proxy headers.
 *
 * These headers are trivially spoofable in general. Behind Vercel they are
 * rewritten by the platform and can be trusted; anywhere else they cannot.
 * Treated accordingly — as a bucketing hint, never as identity.
 */
export function clientKey(headers: Headers, scope: string): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown';
  return `${scope}:${ip}`;
}
