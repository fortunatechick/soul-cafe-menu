import { getOrder, recordPaymentClaim } from '@/lib/store';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const digits = (v) => String(v || '').replace(/[^0-9]/g, '');

// Compare the last ten digits, so "+91 93269 57595" and "9326957595" are the
// same number. Anything stricter rejects a customer for formatting their own
// phone number differently than the order stored it.
const sameNumber = (a, b) => {
  const x = digits(a).slice(-10);
  const y = digits(b).slice(-10);
  return x.length === 10 && x === y;
};

/**
 * The customer reporting a UPI payment.
 *
 * This records a claim; it does not verify anything. Without a payment gateway
 * the site has no way to check whether the money arrived, so the café confirms
 * it in its own UPI account. The phone number has to match the order, so a
 * stranger with a guessed order number cannot mark someone else's ticket paid.
 */
export async function POST(request) {
  const limit = checkRateLimit(clientIp(request));
  if (!limit.allowed) {
    return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const orderNumber = String(body.orderNumber || '').trim().toUpperCase();
  const order = getOrder(orderNumber);
  if (!order) {
    return Response.json({ error: 'We could not find that order.' }, { status: 404 });
  }
  if (!sameNumber(body.phone, order.customerPhone)) {
    return Response.json({ error: 'That does not match the order.' }, { status: 403 });
  }

  const utr = digits(body.utr).slice(0, 12);
  if (utr && utr.length !== 12) {
    return Response.json({ error: 'A UPI reference number is 12 digits.' }, { status: 400 });
  }

  recordPaymentClaim(orderNumber, { utr });
  return Response.json({ ok: true, paymentStatus: 'claimed' });
}
