/**
 * Temporary in-memory order store.
 *
 * The real backend is not fixed yet. Until it is, placed orders live in the
 * Node process so the confirmation page can verify an order number. On Vercel
 * each serverless instance has its own memory, so an order placed on one
 * instance may not be verifiable from another — that is expected and goes away
 * once a database (or PetPooja itself) becomes the source of truth.
 */

const globalForStore = globalThis;

if (!globalForStore.__soulOrders) {
  globalForStore.__soulOrders = new Map();
}

/** @type {Map<string, object>} */
const orders = globalForStore.__soulOrders;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1

export function generateOrderNumber() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SOUL-${code}`;
}

export function saveOrder(order) {
  orders.set(order.orderNumber, order);
  return order;
}

export function getOrder(orderNumber) {
  return orders.get(orderNumber) || null;
}

export function listOrders() {
  return [...orders.values()].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** Most recent order for a phone number, used to pre-fill a repeat order. */
export function findOrderByPhone(phone) {
  const digits = String(phone || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  return (
    listOrders().find((o) => String(o.customerPhone).replace(/[^\d]/g, '') === digits) || null
  );
}

/**
 * Record that the customer says they have paid.
 *
 * Deliberately a claim, not a fact. A UPI deep link or QR gives the site no way
 * to learn whether money actually moved — that needs a payment gateway and a
 * webhook — so this stores what the customer reported, with the reference
 * number if they had one, for the café to check against its own UPI account.
 * Nothing downstream should treat it as settled.
 */
export function recordPaymentClaim(orderNumber, { utr } = {}) {
  const order = orders.get(orderNumber);
  if (!order) return null;
  order.paymentStatus = 'claimed';
  order.paymentClaim = { utr: utr || '', at: new Date().toISOString() };
  return order;
}
