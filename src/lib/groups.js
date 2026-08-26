/**
 * Group ordering: one basket, several phones, a single order at the end.
 *
 * A group holds item ids and quantities and nothing else — no prices. The order
 * API already re-prices everything from menu.json when the order is placed, so
 * there is no value in a guest's phone quoting a price, and no way for one to
 * push a cheaper number into the bill.
 *
 * Only the host can place the order. That is enforced with a host token handed
 * out once, when the group is created, and never returned by the read endpoint,
 * so possession of the share link buys you a seat at the table but not the
 * ability to close the bill.
 *
 * Storage matches src/lib/store.js: in-process memory, which on Vercel means one
 * instance's memory. A group is short-lived and chatty enough that this holds
 * for a single sitting, and it moves to the same database the orders do.
 */

import menu from '@/data/menu.json';
import { MAX_ITEM_QTY, MAX_LINES, clampQty, cleanText } from '@/lib/limits';

const globalForGroups = globalThis;

if (!globalForGroups.__soulGroups) {
  globalForGroups.__soulGroups = new Map();
}

/** @type {Map<string, object>} */
const groups = globalForGroups.__soulGroups;

export const MAX_MEMBERS = 12;
export const MAX_MEMBER_NAME = 24;
const TTL_MS = 3 * 60 * 60 * 1000; // a long lunch, then it lapses

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1, it gets read aloud

const code = (n) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** Long random token — this is the thing that says who may place the order. */
const token = () => code(8) + code(8) + code(8) + code(8);

/** Every orderable item, so a group line can be checked against the real menu. */
const ITEMS = new Map();
for (const category of menu.categories) {
  for (const item of category.items) {
    ITEMS.set(String(item.id), item);
    for (const v of item.variations || []) ITEMS.set(String(v.id), item);
  }
}

function sweep() {
  const now = Date.now();
  for (const [id, g] of groups) {
    if (now - g.createdAt > TTL_MS) groups.delete(id);
  }
}

export function createGroup(hostName) {
  sweep();
  let id = code(6);
  while (groups.has(id)) id = code(6);

  const hostId = code(10);
  const group = {
    id,
    hostToken: token(),
    hostId,
    createdAt: Date.now(),
    members: [{ id: hostId, name: cleanText(hostName, MAX_MEMBER_NAME) || 'Host', host: true }],
    lines: [],
    closed: false,
    orderNumber: null,
  };
  groups.set(id, group);
  return group;
}

export function getGroup(id) {
  sweep();
  return groups.get(String(id || '').toUpperCase()) || null;
}

export function joinGroup(id, name) {
  const group = getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (group.closed) return { error: 'This group order has already been placed.' };
  if (group.members.length >= MAX_MEMBERS) {
    return { error: `A group can hold ${MAX_MEMBERS} people.` };
  }

  const clean = cleanText(name, MAX_MEMBER_NAME);
  if (!clean) return { error: 'Please add your name so the others know whose order is whose.' };

  const member = { id: code(10), name: clean, host: false };
  group.members.push(member);
  return { group, member };
}

const isMember = (group, memberId) => group.members.some((m) => m.id === memberId);

/**
 * Set one member's quantity for one item. Quantity 0 removes the line.
 *
 * A member may only touch their own lines; the host may clear anyone's, which is
 * the one asymmetry — somebody has to be able to take the extra latte off the
 * bill before it is placed.
 */
export function setGroupLine(id, memberId, { itemId, variation, quantity, hostToken }) {
  const group = getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (group.closed) return { error: 'This group order has already been placed.' };

  const host = Boolean(hostToken) && hostToken === group.hostToken;
  if (!host && !isMember(group, memberId)) return { error: 'Join the group before adding items.' };

  const item = ITEMS.get(String(itemId));
  if (!item) return { error: 'That item is no longer on the menu.' };
  if (item.available === false) return { error: `${item.name} is sold out.` };

  const variationName = variation ? cleanText(variation, 40) : null;
  const key = `${itemId}::${variationName || ''}::${memberId}`;
  const qty = Number(quantity);

  const existing = group.lines.findIndex((l) => l.key === key);

  if (!qty || qty <= 0) {
    if (existing >= 0) group.lines.splice(existing, 1);
    return { group };
  }

  if (existing >= 0) {
    group.lines[existing].quantity = clampQty(qty);
    return { group };
  }

  if (group.lines.length >= MAX_LINES) {
    return { error: `A group order can hold ${MAX_LINES} different items.` };
  }

  group.lines.push({
    key,
    memberId,
    itemId: String(itemId),
    variation: variationName,
    quantity: Math.min(MAX_ITEM_QTY, clampQty(qty)),
  });
  return { group };
}

/** Mark the group placed so no one keeps adding to an order already in the kitchen. */
export function closeGroup(id, hostToken, orderNumber) {
  const group = getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (hostToken !== group.hostToken) return { error: 'Only the host can place the group order.' };
  group.closed = true;
  group.orderNumber = orderNumber || null;
  return { group };
}

/**
 * The public shape. Deliberately omits hostToken — this is what every phone in
 * the group polls, and the token is the only thing separating host from guest.
 */
export function publicGroup(group) {
  return {
    id: group.id,
    closed: group.closed,
    orderNumber: group.orderNumber,
    members: group.members.map((m) => ({ id: m.id, name: m.name, host: m.host })),
    lines: group.lines.map((l) => ({
      key: l.key,
      memberId: l.memberId,
      itemId: l.itemId,
      variation: l.variation,
      quantity: l.quantity,
    })),
  };
}
