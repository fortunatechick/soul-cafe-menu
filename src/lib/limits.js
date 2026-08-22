/**
 * Order limits, shared by the browser and the order API.
 *
 * They live in one file on purpose: when the cart let a customer build a
 * quantity the server refused, the result was a dead end at checkout with an
 * error that named no limit. The cart clamps to these, and the API enforces
 * them — same numbers, so the two can't drift apart.
 */

export const MAX_ITEM_QTY = 50; // per line
export const MAX_LINES = 40; // distinct items in one order
export const MAX_UNITS = 200; // total items across the order
export const MAX_ORDER_TOTAL = 25000; // ₹, a sanity ceiling on one ticket

export const MAX_NAME = 80;
export const MAX_ADDRESS = 300;
export const MAX_NOTES = 500;

export const clampQty = (n) => Math.max(1, Math.min(MAX_ITEM_QTY, Math.floor(Number(n) || 1)));

/**
 * Trim a free-text field to something a kitchen ticket and a WhatsApp message
 * can carry. Strips control characters and angle brackets: React escapes them
 * on our own pages, but this text is also handed to PetPooja and pasted into a
 * WhatsApp message, and neither needs `<script>` in a customer name.
 */
export function cleanText(value, max) {
  const printable = [...String(value ?? '')]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code !== 127; // drop control characters
    })
    .join('');

  return printable
    .replace(/[<>]/g, '')
    .replace(/[ 	]+/g, ' ')
    .trim()
    .slice(0, max);
}
