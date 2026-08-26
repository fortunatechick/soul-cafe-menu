'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '@/context/CartContext';

const STORAGE_KEY = 'soulmenu_group';
const POLL_MS = 3500;
const SLOW_POLL_MS = 15000;
const MISSES_BEFORE_BACKOFF = 4;

const GroupContext = createContext(null);

/**
 * Group ordering across several phones.
 *
 * Each person keeps using their own cart exactly as before — steppers, variation
 * picker, all of it. This provider mirrors that cart up to the group and polls
 * everyone else's lines back, so what you just tapped never lags while the rest
 * of the table is a few seconds behind.
 *
 * Two rules earned by getting them wrong:
 *
 * 1. The whole cart is sent, not a diff. Syncing item by item meant one dropped
 *    request could leave an item everyone else still saw after it was removed.
 *    Sending the full list makes absence meaningful — whatever is not in it is
 *    gone.
 *
 * 2. A failed poll never clears the membership. It used to: a 404 was read as
 *    "the group is gone", when on Vercel it usually means the request reached an
 *    instance that had never seen it. That silently dropped the host out of
 *    their own group on refresh, taking the host token with it, and every later
 *    change stopped reaching anyone. Now a failure only marks the group
 *    unreachable and keeps trying.
 */
export function GroupProvider({ children }) {
  const { lines, hydrated } = useCart();

  const [membership, setMembership] = useState(null); // { id, memberId, name, hostToken? }
  const [group, setGroup] = useState(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState('');

  const missesRef = useRef(0);
  const syncedRef = useRef(''); // signature of what the server was last told

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
      // storage blocked — the group won't survive a reload, but this session works
    }
  }, [membership, ready]);

  /* ------------------------------- polling ------------------------------- */

  const refresh = useCallback(async (groupId) => {
    if (!groupId) return null;
    try {
      const res = await fetch(`/api/groups/${groupId}`, { cache: 'no-store' });
      if (!res.ok) {
        // Never destructive. An unreachable group is not a deleted one.
        missesRef.current += 1;
        setConnected(false);
        return null;
      }
      const data = await res.json();
      if (data.group) {
        missesRef.current = 0;
        setConnected(true);
        setGroup(data.group);
        return data.group;
      }
      return null;
    } catch {
      missesRef.current += 1;
      setConnected(false);
      return null;
    }
  }, []);

  useEffect(() => {
    const id = membership?.id;
    if (!id) return undefined;

    let timer;
    let cancelled = false;

    const tick = async () => {
      await refresh(id);
      if (cancelled) return;
      // Back off once it is clearly not answering, so a lapsed group left open
      // in a tab does not poll every few seconds for hours.
      const wait = missesRef.current >= MISSES_BEFORE_BACKOFF ? SLOW_POLL_MS : POLL_MS;
      timer = setTimeout(tick, wait);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [membership?.id, refresh]);

  /* -------------------------- cart -> group sync -------------------------- */

  useEffect(() => {
    if (!membership?.id || !hydrated || group?.closed) return;

    const payload = lines.map((l) => ({
      itemId: l.id,
      variation: l.variation,
      quantity: l.quantity,
    }));
    const signature = JSON.stringify(payload);
    if (signature === syncedRef.current) return;

    syncedRef.current = signature;

    (async () => {
      try {
        const res = await fetch(`/api/groups/${membership.id}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: membership.memberId, lines: payload }),
        });
        const data = await res.json();
        if (data.group) {
          setGroup(data.group);
          setConnected(true);
        } else if (data.error) {
          setError(data.error);
          syncedRef.current = ''; // let the next change try again
        }
      } catch {
        syncedRef.current = ''; // offline — retry on the next cart change
      }
    })();
  }, [lines, membership, hydrated, group?.closed]);

  /* -------------------------------- actions ------------------------------- */

  const start = useCallback(async (name) => {
    setError('');
    try {
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
      syncedRef.current = ''; // push the existing cart up to the new group
      missesRef.current = 0;
      setMembership({
        id: data.group.id,
        memberId: data.memberId,
        name,
        hostToken: data.hostToken,
      });
      setGroup(data.group);
      return data.group;
    } catch {
      setError('Could not start the group. Check your connection and try again.');
      return null;
    }
  }, []);

  const join = useCallback(async (id, name) => {
    setError('');
    try {
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
      syncedRef.current = '';
      missesRef.current = 0;
      setMembership({ id: data.group.id, memberId: data.memberId, name });
      setGroup(data.group);
      return data.group;
    } catch {
      setError('Could not join the group. Check your connection and try again.');
      return null;
    }
  }, []);

  const leave = useCallback(() => {
    setMembership(null);
    setGroup(null);
    setError('');
    missesRef.current = 0;
    syncedRef.current = '';
  }, []);

  /** Host only: take somebody else's item off the bill before it is placed. */
  const removeLine = useCallback(
    async (line) => {
      if (!membership?.hostToken) return;
      try {
        const res = await fetch(`/api/groups/${membership.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            memberId: membership.memberId,
            hostToken: membership.hostToken,
            targetMemberId: line.memberId,
            itemId: line.itemId,
            variation: line.variation,
            quantity: 0,
          }),
        });
        const data = await res.json();
        if (data.group) setGroup(data.group);
        else if (data.error) setError(data.error);
      } catch {
        setError('Could not remove that item. Please try again.');
      }
    },
    [membership]
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
      leave();
    },
    [membership, leave]
  );

  const value = useMemo(() => {
    const isHost = Boolean(membership?.hostToken);
    const memberId = membership?.memberId || null;

    // Everyone else's lines. This member's own come from their cart, live, so
    // the two never overlap and nothing is counted twice.
    const otherLines = (group?.lines || []).filter((l) => l.memberId !== memberId);
    const othersTotal = otherLines.reduce((sum, l) => sum + l.lineTotal, 0);

    return {
      ready,
      group,
      membership,
      isHost,
      inGroup: Boolean(membership?.id),
      connected,
      memberId,
      otherLines,
      othersTotal,
      memberName: (id) => group?.members.find((m) => m.id === id)?.name || 'Someone',
      hostName: group?.members.find((m) => m.host)?.name || 'the host',
      error,
      clearError: () => setError(''),
      start,
      join,
      leave,
      refresh,
      removeLine,
      close,
    };
  }, [ready, group, membership, connected, error, start, join, leave, refresh, removeLine, close]);

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used inside GroupProvider');
  return ctx;
}
