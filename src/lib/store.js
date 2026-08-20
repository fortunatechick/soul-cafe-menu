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
