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

/**
 * One IP is not one customer. Everyone on the café's own wifi shares a public
 * address, as does most of an Indian mobile network behind carrier-grade NAT,
 * so a tight per-IP cap locks out real people during a rush. The IP limit is
 * therefore loose — it exists to blunt a flood, not to police customers — and
 * the tight limit is per phone number, which is much closer to "one person".
 */
const MAX_PER_IP = 40;
const MAX_PER_PHONE = 4;

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
export function checkRateLimit(key, max = MAX_PER_IP) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (hits.length >= max) {
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

/** Same window, keyed on the phone number placing the order. */
export function checkPhoneLimit(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return { allowed: true, retryAfterSec: 0 };
  return checkRateLimit(`phone:${digits}`, MAX_PER_PHONE);
}

export const RATE_LIMITS = { MAX_PER_IP, MAX_PER_PHONE, WINDOW_MS };
