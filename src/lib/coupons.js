import crypto from 'node:crypto';

import couponData from '@/data/coupons.json';

/**
 * Coupon rules live in src/data/coupons.json and are evaluated here, on the
 * server, for both the live "apply" check and the actual order. The browser
 * never decides what a discount is worth — /api/orders/place recomputes it from
 * scratch, so a tampered request cannot invent one.
 *
 * PetPooja owns discounts in its own system, but exposes them through the POS
 * API rather than a public offers endpoint, and no credentials are configured
 * yet. Until then this file is the source of truth; the resolved amount is
 * still handed to PetPooja as discount_total so the POS total reconciles.
 */

const COUPONS = new Map(
  couponData.coupons
    .filter((c) => !c.codeHash)
    .map((c) => [c.code.trim().toUpperCase(), c])
);

/**
 * Some coupons are stored as a SHA-256 hash instead of the code itself.
 *
 * The point is that reading the repository does not hand you a working code.
 * A hash cannot be reversed, so the file can say a 99%-off coupon exists
 * without saying what it is; only somebody who already knows the code can
 * produce a matching hash. It is checked in constant time so that timing does
 * not leak how much of a guess was right.
 */
const HASHED = couponData.coupons.filter((c) => c.codeHash);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function matchHashed(cleaned) {
  const digest = Buffer.from(sha256(cleaned), 'hex');
  for (const coupon of HASHED) {
    const expected = Buffer.from(coupon.codeHash, 'hex');
    if (expected.length === digest.length && crypto.timingSafeEqual(expected, digest)) {
      return coupon;
    }
  }
  return null;
}

export function findCoupon(code) {
  const cleaned = String(code || '').trim().toUpperCase();
  if (!cleaned) return null;
  return COUPONS.get(cleaned) || matchHashed(cleaned);
}

/**
 * @returns {{ok: boolean, discount: number, message: string, coupon: object|null}}
 */
export function evaluateCoupon(code, { subtotal, orderType }) {
  const cleaned = String(code || '').trim().toUpperCase();
  if (!cleaned) return { ok: false, discount: 0, message: 'Enter a coupon code.', coupon: null };

  const coupon = findCoupon(cleaned);
  if (!coupon || coupon.active === false) {
    return { ok: false, discount: 0, message: "That code isn't valid.", coupon: null };
  }

  if (coupon.expiresOn) {
    // Compare date-only, so a coupon is usable through the whole of its last day.
    const today = new Date().toISOString().slice(0, 10);
    if (today > coupon.expiresOn) {
      return { ok: false, discount: 0, message: 'That code has expired.', coupon: null };
    }
  }

  if (Array.isArray(coupon.orderTypes) && !coupon.orderTypes.includes(orderType)) {
    const only = coupon.orderTypes.join(' or ');
    return { ok: false, discount: 0, message: `That code works on ${only} orders only.`, coupon: null };
  }

  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    const short = coupon.minSubtotal - subtotal;
    return {
      ok: false,
      discount: 0,
      message: `Spend ₹${short} more to use this code.`,
      coupon: null,
    };
  }

  let discount =
    coupon.type === 'percent'
      ? Math.floor((subtotal * coupon.value) / 100)
      : Math.floor(coupon.value);

  if (coupon.type === 'percent' && coupon.maxDiscount) {
    discount = Math.min(discount, coupon.maxDiscount);
  }

  // Never discount below zero, and never more than the order is worth.
  discount = Math.max(0, Math.min(discount, subtotal));

  if (discount <= 0) {
    return { ok: false, discount: 0, message: "That code doesn't apply here.", coupon: null };
  }

  return {
    ok: true,
    discount,
    message: `${coupon.code} applied — you saved ₹${discount}`,
    coupon: { code: coupon.code, description: coupon.description || '' },
  };
}
