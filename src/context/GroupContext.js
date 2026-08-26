'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCart, lineKey } from '@/context/CartContext';

const STORAGE_KEY = 'soulmenu_group';
const POLL_MS = 3500;

const GroupContext = createContext(null);

/**
 * Group ordering across several phones.
 *
 * Each person keeps using their own cart exactly as before — the steppers, the
 * variation picker, all of it. This provider mirrors whatever is in that cart up
 * to the group on the server, and polls back everyone else's lines. So a member
 * sees their own items live and the rest of the table a few seconds behind,
 * which is the right trade: the thing you just tapped never lags.
 *
 * Only the host can place the order. The host token that proves it is handed out
 * once, when the group is created, and is never part of the polled state.
 */
export function GroupProvider({ children }) {
  const { lines, addItem, clearCart, hydrated } = useCart();

  const [membership, setMembership] = useState(null); // { id, memberId, name, hostToken? }
  const [group, setGroup] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // What we last told the server, so a cart change syncs only what changed.
  const syncedRef = useRef(new Map());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setMembership(JSON.parse(saved));
    } catch {
      // corrupt payload — start without a group
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      if (membership) localStorage.setItem(STORAGE_KEY, JSON.stringify(membership));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage blocked — the group simply won't survive a reload
    }
  }, [membership, ready]);

  /* ------------------------------- polling ------------------------------- */

  const refresh = useCallback(async (groupId) => {
    const id = groupId || membership?.id;
    if (!id) return null;
    try {
      const res = await fetch(`/api/groups/${id}`, { cache: 'no-store' });
      if (res.status === 404) {
        // Expired or served by an instance that never had it.
        setMembership(null);
        setGroup(null);
        return null;
      }
      const data = await res.json();
      if (data.group) setGroup(data.group);
      return data.group || null;
    } catch {
      return null; // a dropped poll is not worth surfacing; the next one retries
    }
  }, [membership?.id]);

  useEffect(() => {
    if (!membership?.id) return undefined;
    refresh(membership.id);
    const timer = setInterval(() => refresh(membership.id), POLL_MS);
    return () => clearInterval(timer);
  }, [membership?.id, refresh]);

  /* -------------------------- cart -> group sync -------------------------- */

  useEffect(() => {
    if (!membership?.id || !hydrated || group?.closed) return;

    const current = new Map(lines.map((l) => [lineKey(l.id, l.variation), l]));
    const previous = syncedRef.current;
    const pending = [];

    for (const [key, line] of current) {
      if (previous.get(key) !== line.quantity) {
        pending.push({ itemId: line.id, variation: line.variation, quantity: line.quantity });
      }
    }
    for (const [key] of previous) {
      if (!current.has(key)) {
        const [itemId, variation] = key.split('::');
        pending.push({ itemId, variation: variation || null, quantity: 0 });
      }
    }
    if (!pending.length) return;

    // Record first: a failed post retries on the next cart change, and this
    // stops one slow request re-firing every render in the meantime.
    syncedRef.current = new Map([...current].map(([k, l]) => [k, l.quantity]));

    (async () => {
      for (const change of pending) {
        try {
          const res = await fetch(`/api/groups/${membership.id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...change, memberId: membership.memberId }),
          });
          const data = await res.json();
          if (data.group) setGroup(data.group);
          else if (data.error) setError(data.error);
        } catch {
          // offline — the next cart change re-sends
        }
      }
    })();
  }, [lines, membership, hydrated, group?.closed]);

  /* -------------------------------- actions ------------------------------- */

  const start = useCallback(async (name) => {
    setError('');
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return null;
    }
    syncedRef.current = new Map(); // push the existing cart up to the new group
    setMembership({
      id: data.group.id,
      memberId: data.memberId,
      name,
      hostToken: data.hostToken,
    });
    setGroup(data.group);
    return data.group;
  }, []);

  const join = useCallback(async (id, name) => {
    setError('');
    const res = await fetch(`/api/groups/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return null;
    }
    syncedRef.current = new Map();
    setMembership({ id: data.group.id, memberId: data.memberId, name });
    setGroup(data.group);
    return data.group;
  }, []);

  const leave = useCallback(() => {
    // Their lines stay on the group — someone walking away from a shared basket
    // has usually already ordered, and the host can clear anything unwanted.
    setMembership(null);
    setGroup(null);
    syncedRef.current = new Map();
  }, []);

  /** Host only: pull everyone else's items into this device's cart to check out. */
  const collectForCheckout = useCallback(
    (menuIndex) => {
      if (!group || !membership?.hostToken) return 0;
      let added = 0;
      for (const line of group.lines) {
        if (line.memberId === membership.memberId) continue; // already in this cart
        const item = menuIndex.get(String(line.itemId));
        if (!item) continue;
        const variation = line.variation
          ? (item.variations || []).find((v) => v.name === line.variation) || null
          : null;
        addItem(item, variation, line.quantity);
        added += line.quantity;
      }
      return added;
    },
    [group, membership, addItem]
  );

  /** Host only: the group is now an order. */
  const close = useCallback(
    async (orderNumber) => {
      if (!membership?.hostToken) return;
      try {
        await fetch(`/api/groups/${membership.id}/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken: membership.hostToken, orderNumber }),
        });
      } catch {
        // The order is already placed; the group lapsing on its own is fine.
      }
      setMembership(null);
      setGroup(null);
      syncedRef.current = new Map();
    },
    [membership]
  );

  const value = useMemo(() => {
    const isHost = Boolean(membership?.hostToken);
    const memberId = membership?.memberId || null;

    // Everyone else's lines — this member's own come from their cart, live.
    const otherLines = (group?.lines || []).filter((l) => l.memberId !== memberId);

    return {
      ready,
      group,
      membership,
      isHost,
      inGroup: Boolean(membership?.id && group),
      memberId,
      otherLines,
      memberName: (id) => group?.members.find((m) => m.id === id)?.name || 'Someone',
      hostName: group?.members.find((m) => m.host)?.name || 'the host',
      error,
      clearError: () => setError(''),
      start,
      join,
      leave,
      refresh,
      collectForCheckout,
      close,
      clearCart,
    };
  }, [ready, group, membership, error, start, join, leave, refresh, collectForCheckout, close, clearCart]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used inside GroupProvider');
  return ctx;
}
