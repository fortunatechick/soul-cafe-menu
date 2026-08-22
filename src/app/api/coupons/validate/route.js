import { evaluateCoupon } from '@/lib/coupons';

export const dynamic = 'force-dynamic';

/**
 * Live feedback for the coupon field. This is a convenience only — the order
 * API re-evaluates the same coupon against the server's own prices before
 * charging anything, so a forged response here buys nothing.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, discount: 0, message: 'Malformed request.' }, { status: 400 });
  }

  const subtotal = Number(body.subtotal);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return Response.json({ ok: false, discount: 0, message: 'Invalid cart total.' }, { status: 400 });
  }

  const orderType = body.orderType === 'pickup' ? 'pickup' : 'delivery';
  const result = evaluateCoupon(body.code, { subtotal, orderType });

  return Response.json(result, { status: result.ok ? 200 : 422 });
}
