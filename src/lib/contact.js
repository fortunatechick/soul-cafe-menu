/**
 * The café's WhatsApp number, in one place.
 *
 * It appears in the footer and in the confirmation page's ordering link, so it
 * lives here rather than being written out twice — a number that changes in one
 * place and not the other is the kind of thing nobody notices until an order
 * goes to a dead line.
 *
 * Override with NEXT_PUBLIC_WA_NUMBER (digits only, country code first).
 */

export const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '919326957595';

/** "919326957595" -> "+91 93269 57595" */
export function formatPhone(number = WA_NUMBER) {
  const digits = String(number).replace(/[^0-9]/g, '');
  const local = digits.slice(-10);
  const country = digits.slice(0, -10) || '91';
  if (local.length !== 10) return `+${digits}`;
  return `+${country} ${local.slice(0, 5)} ${local.slice(5)}`;
}

export const WA_LINK = `https://wa.me/${WA_NUMBER}`;
