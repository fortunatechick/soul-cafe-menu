/**
 * Group ordering: one basket, several phones, a single order at the end.
 *
 * A group is stored as a hash of small fields rather than one document:
 *
 *   meta        {id, hostToken, hostId, createdAt, closed, orderNumber}
 *   m:<id>      {id, name, host}          one per person
 *   l:<id>      [{itemId, variation, quantity}]   one per person
 *
 * Each phone only ever writes its own `l:` field, so two people adding at the
 * same moment cannot overwrite one another. Read-modify-write on a single blob
 * would drop whichever landed second, and in a shared basket that reads as
 * someone's coffee quietly disappearing.
 *
 * Prices are not stored. The order API re-prices from menu.json when the order
 * is placed, so a guest's phone quoting a number cannot change the bill; the
 * prices returned here are for display and come from the same file.
 *
 * Only the host can place the order, enforced with a host token handed out once
 * at creation and never included in the state everyone polls.
 */

import menu from '@/data/menu.json';
import { MAX_ITEM_QTY, MAX_LINES, clampQty, cleanText } from '@/lib/limits';
import * as kv from '@/lib/kv';

export const MAX_MEMBERS = 12;
export const MAX_MEMBER_NAME = 24;
const TTL_SECONDS = 3 * 60 * 60; // a long lunch, then it lapses

/** True when groups are shared across instances rather than held in memory. */
export const shared = kv.ready;

/* ------------------------------- storage -------------------------------- */

const globalForGroups = globalThis;
if (!globalForGroups.__soulGroupFields) globalForGroups.__soulGroupFields = new Map();

/** @type {Map<string, {fields: object, createdAt: number}>} */
const memory = globalForGroups.__soulGroupFields;

const keyFor = (id) => `soulgroup:${id}`;

function sweepMemory() {
  const cutoff = Date.now() - TTL_SECONDS * 1000;
  for (const [id, entry] of memory) {
    if (entry.createdAt < cutoff) memory.delete(id);
  }
}

async function readFields(id) {
  if (kv.ready) return kv.hgetall(keyFor(id));
  sweepMemory();
  return memory.get(id)?.fields || null;
}

async function writeField(id, field, value) {
  if (kv.ready) return kv.hset(keyFor(id), field, value, TTL_SECONDS);
  const entry = memory.get(id) || { fields: {}, createdAt: Date.now() };
  entry.fields[field] = value;
  memory.set(id, entry);
  return true;
}

async function removeField(id, field) {
  if (kv.ready) return kv.hdel(keyFor(id), field);
  const entry = memory.get(id);
  if (entry) delete entry.fields[field];
  return true;
}

/* -------------------------------- helpers -------------------------------- */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1, it gets read aloud

const code = (n) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** Long random token — the one thing that says who may place the order. */
const token = () => code(8) + code(8) + code(8) + code(8);

/** Every orderable item, so a line can be checked and priced against the menu. */
const ITEMS = new Map();
for (const category of menu.categories) {
  for (const item of category.items) {
    ITEMS.set(String(item.id), item);
    for (const v of item.variations || []) ITEMS.set(String(v.id), item);
  }
}

/** Assemble the flat fields back into a group. */
function assemble(fields) {
  if (!fields || !fields.meta) return null;
  const members = [];
  const lines = [];

  for (const [field, value] of Object.entries(fields)) {
    if (field.startsWith('m:')) members.push(value);
    else if (field.startsWith('l:')) {
      const memberId = field.slice(2);
      for (const line of value || []) lines.push({ ...line, memberId });
    }
  }

  members.sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0));
  return { ...fields.meta, members, lines };
}

export async function getGroup(id) {
  const clean = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  return assemble(await readFields(clean));
}

/* ------------------------------- operations ------------------------------ */

export async function createGroup(hostName) {
  const id = code(6);
  const hostId = code(10);
  const meta = {
    id,
    hostToken: token(),
    hostId,
    createdAt: Date.now(),
    closed: false,
    orderNumber: null,
  };

  await writeField(id, 'meta', meta);
  await writeField(id, `m:${hostId}`, {
    id: hostId,
    name: cleanText(hostName, MAX_MEMBER_NAME) || 'Host',
    host: true,
  });

  return { ...meta, members: [{ id: hostId, name: hostName, host: true }], lines: [] };
}

export async function joinGroup(id, name) {
  const group = await getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (group.closed) return { error: 'This group order has already been placed.' };
  if (group.members.length >= MAX_MEMBERS) {
    return { error: `A group can hold ${MAX_MEMBERS} people.` };
  }

  const clean = cleanText(name, MAX_MEMBER_NAME);
  if (!clean) return { error: 'Please add your name so the others know whose order is whose.' };

  const member = { id: code(10), name: clean, host: false };
  await writeField(group.id, `m:${member.id}`, member);

  return { group: await getGroup(group.id), member };
}

/**
 * Set one member's quantity for one item. Quantity 0 removes the line.
 *
 * A member edits their own lines. The host may edit anyone's, which is the one
 * asymmetry: somebody has to be able to take the extra latte off the bill before
 * it is placed, and it may as well be whoever is paying.
 */
export async function setGroupLine(id, memberId, opts = {}) {
  const { itemId, variation, quantity, hostToken, targetMemberId } = opts;

  const group = await getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (group.closed) return { error: 'This group order has already been placed.' };

  const isHost = Boolean(hostToken) && hostToken === group.hostToken;

  // Asking to touch someone else's line without the host token is refused
  // outright rather than quietly redirected at your own lines, which reported
  // success for something that had not happened.
  if (targetMemberId && targetMemberId !== memberId && !isHost) {
    return { error: 'Only the host can change someone else’s items.' };
  }

  const owner = isHost && targetMemberId ? targetMemberId : memberId;
  if (!group.members.some((m) => m.id === owner)) {
    return { error: 'Join the group before adding items.' };
  }

  const item = ITEMS.get(String(itemId));
  if (!item) return { error: 'That item is no longer on the menu.' };
  if (item.available === false) return { error: `${item.name} is sold out.` };

  const variationName = variation ? cleanText(variation, 40) : null;
  const qty = Number(quantity);

  const fields = await readFields(group.id);
  const own = (fields?.[`l:${owner}`] || []).filter(Boolean);
  const at = own.findIndex(
    (l) => String(l.itemId) === String(itemId) && (l.variation || null) === variationName
  );

  if (!qty || qty <= 0) {
    if (at >= 0) own.splice(at, 1);
  } else if (at >= 0) {
    own[at].quantity = clampQty(qty);
  } else {
    if (group.lines.length >= MAX_LINES) {
      return { error: `A group order can hold ${MAX_LINES} different items.` };
    }
    own.push({
      itemId: String(itemId),
      variation: variationName,
      quantity: Math.min(MAX_ITEM_QTY, clampQty(qty)),
    });
  }

  if (own.length) await writeField(group.id, `l:${owner}`, own);
  else await removeField(group.id, `l:${owner}`);

  return { group: await getGroup(group.id) };
}

/**
 * Replace one member's whole set of lines.
 *
 * A phone's cart is the truth about what that person wants, so it is sent whole.
 * Syncing item by item meant a removal could be missed and the item lingered on
 * everyone else's screen; sending the entire list cannot leave a stale line
 * behind, because whatever is absent is absent.
 */
export async function replaceMemberLines(id, memberId, rawLines) {
  const group = await getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (group.closed) return { error: 'This group order has already been placed.' };
  if (!group.members.some((m) => m.id === memberId)) {
    return { error: 'Join the group before adding items.' };
  }

  const seen = new Set();
  const clean = [];

  for (const raw of Array.isArray(rawLines) ? rawLines : []) {
    const item = ITEMS.get(String(raw?.itemId));
    if (!item || item.available === false) continue;

    const variationName = raw.variation ? cleanText(raw.variation, 40) : null;
    const dedupe = `${raw.itemId}::${variationName || ''}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const qty = Number(raw.quantity);
    if (!qty || qty <= 0) continue;

    clean.push({
      itemId: String(raw.itemId),
      variation: variationName,
      quantity: Math.min(MAX_ITEM_QTY, clampQty(qty)),
    });
    if (clean.length >= MAX_LINES) break;
  }

  if (clean.length) await writeField(group.id, `l:${memberId}`, clean);
  else await removeField(group.id, `l:${memberId}`);

  return { group: await getGroup(group.id) };
}

/** Host only: the group is now an order, so nobody keeps adding to it. */
export async function closeGroup(id, hostToken, orderNumber) {
  const group = await getGroup(id);
  if (!group) return { error: 'That group has expired or does not exist.' };
  if (hostToken !== group.hostToken) return { error: 'Only the host can place the group order.' };

  const fields = await readFields(group.id);
  await writeField(group.id, 'meta', {
    ...fields.meta,
    closed: true,
    orderNumber: orderNumber || null,
  });

  return { group: await getGroup(group.id) };
}

/**
 * The public shape. Deliberately omits hostToken — this is what every phone
 * polls, and the token is the only thing separating host from guest.
 *
 * Lines carry a name and price so a phone can show the basket without holding
 * the whole menu; the order API still prices the real order itself.
 */
export function publicGroup(group) {
  return {
    id: group.id,
    closed: group.closed,
    orderNumber: group.orderNumber,
    members: group.members.map((m) => ({ id: m.id, name: m.name, host: m.host })),
    lines: group.lines.map((l) => {
      const item = ITEMS.get(String(l.itemId));
      const variation = l.variation
        ? (item?.variations || []).find((v) => v.name === l.variation)
        : null;
      const unitPrice = variation?.price ?? item?.price ?? 0;
      return {
        key: `${l.itemId}::${l.variation || ''}::${l.memberId}`,
        memberId: l.memberId,
        itemId: l.itemId,
        variation: l.variation,
        quantity: l.quantity,
        name: item?.name || 'Item',
        unitPrice,
        lineTotal: unitPrice * l.quantity,
      };
    }),
  };
}
