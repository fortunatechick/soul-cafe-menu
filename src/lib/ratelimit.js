/**
 * Per-IP sliding-window rate limit for order placement.
 *
 * A CAPTCHA raises the cost of each automated order; this caps how many can be
 * attempted at all, which is what actually protects the kitchen from a flood of
 * fake tickets. The two are complementary — this one needs no third party and
 * is always on.
 *
 * In-memory, so each serverless instance counts separately and a restart
 * forgets. That weakens it under heavy scale-out; a shared store (Redis, or
 * Vercel KV) is the upgrade when the café has real traffic.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ORDERS = 6; // per IP per window — well above any real customer

if (!globalThis.__soulRateBuckets) globalThis.__soulRateBuckets = new Map();

/** @type {Map<string, number[]>} */
const buckets = globalThis.__soulRateBuckets;

export function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * @returns {{allowed: boolean, retryAfterSec: number}}
 */
export function checkRateLimit(key) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (hits.length >= MAX_ORDERS) {
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
    buckets.set(key, hits);
    return { allowed: false, retryAfterSec };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < WINDOW_MS)) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}
