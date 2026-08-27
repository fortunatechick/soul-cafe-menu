/**
 * Cloudflare Turnstile, when it is configured — and nothing otherwise.
 *
 * There was a second layer here: an HMAC-signed token the server minted for
 * anyone who asked, returned with the order. It was honest about its own
 * weakness in this comment, and in practice it only made every real customer
 * tick a box. It has been removed rather than left pretending.
 *
 * So: with TURNSTILE_SECRET_KEY set, orders are checked against Cloudflare
 * before anything is priced or recorded. Without it there is no human check at
 * all, and src/lib/ratelimit.js — 40 orders per IP and 4 per phone number in
 * ten minutes — is what caps the damage a script can do.
 */

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

async function verifyTurnstile(token, ip) {
  if (!token) return { ok: false, reason: 'Please complete the verification.' };

  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    });
    if (ip) body.set('remoteip', ip);

    const res = await fetch(TURNSTILE_VERIFY, { method: 'POST', body });
    const data = await res.json().catch(() => null);

    if (data?.success) return { ok: true };
    return { ok: false, reason: 'Verification failed. Please try again.' };
  } catch {
    // Cloudflare being unreachable should not stop the café taking orders.
    return { ok: true, degraded: true };
  }
}

/**
 * @returns {Promise<{ok: boolean, reason?: string, method: string}>}
 */
export async function verifyHuman({ turnstileToken, ip }) {
  const result = await verifyTurnstile(turnstileToken, ip);
  return { ...result, method: 'turnstile' };
}
