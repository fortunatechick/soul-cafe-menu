import crypto from 'node:crypto';

/**
 * Keeping automated orders out, in two layers.
 *
 * 1. Cloudflare Turnstile, when TURNSTILE_SECRET_KEY is set. This is the real
 *    protection: a privacy-preserving CAPTCHA whose token is verified here,
 *    server-side, against Cloudflare. Free, and the keys take a few minutes to
 *    get — see the README.
 *
 * 2. A signed human-check, used when Turnstile is not configured so the order
 *    form is never completely open. The server issues an HMAC-signed token
 *    tied to a timestamp; the browser returns it with the order. That stops
 *    naive replay and blind POSTing, but a script that fetches a token before
 *    each order will pass it. It is a stopgap, not a substitute — the README
 *    says so plainly.
 *
 * Rate limiting (src/lib/ratelimit.js) applies either way, and is what actually
 * caps the damage a determined script can do.
 */

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const TOKEN_TTL_MS = 15 * 60 * 1000; // long enough to fill the form in
const MIN_FILL_MS = 3000; // a human cannot complete checkout faster than this

export const turnstileConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

function secret() {
  // Falls back to a per-process value so the check still functions without
  // configuration; orders simply do not survive a restart, which is fine for
  // a token that lives 15 minutes.
  if (!globalThis.__soulBotSecret) {
    globalThis.__soulBotSecret =
      process.env.BOTCHECK_SECRET || crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__soulBotSecret;
}

/** Mint a token for the browser to hand back with the order. */
export function issueChallenge() {
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${issuedAt}.${nonce}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return { token: `${payload}.${sig}`, issuedAt };
}

function verifySignedChallenge(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'Malformed verification token.' };

  const [issuedAt, nonce, sig] = parts;
  const expected = crypto
    .createHmac('sha256', secret())
    .update(`${issuedAt}.${nonce}`)
    .digest('hex');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Verification failed. Please reload and try again.' };
  }

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0) {
    return { ok: false, reason: 'Verification failed. Please reload and try again.' };
  }
  if (age > TOKEN_TTL_MS) {
    return { ok: false, reason: 'Verification expired. Please reload and try again.' };
  }
  if (age < MIN_FILL_MS) {
    return { ok: false, reason: 'That was too quick — please try again.' };
  }

  return { ok: true };
}

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
export async function verifyHuman({ turnstileToken, challengeToken, ip }) {
  if (turnstileConfigured()) {
    const result = await verifyTurnstile(turnstileToken, ip);
    return { ...result, method: 'turnstile' };
  }
  const result = verifySignedChallenge(challengeToken);
  return { ...result, method: 'signed-challenge' };
}
