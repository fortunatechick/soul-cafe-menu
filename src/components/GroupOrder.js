'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGroup } from '@/context/GroupContext';
import { useCart } from '@/context/CartContext';
import { formatINR } from '@/lib/api';

/**
 * Group ordering UI: the start/share sheet, the join prompt, and the running
 * basket of what everyone has added.
 *
 * The rule the whole thing turns on is that one order gets placed, by the host.
 * Guests get a basket they can add to and a clear statement of who is closing
 * the bill, rather than a checkout button that would fail.
 */
export default function GroupOrder({ open, onClose, menuIndex, onCheckout }) {
  const {
    ready, group, inGroup, isHost, memberId, otherLines, memberName, hostName,
    error, clearError, start, join, leave, collectForCheckout,
  } = useGroup();
  const { lines: myLines, subtotal: mySubtotal } = useCart();

  const [name, setName] = useState('');
  const [pendingJoin, setPendingJoin] = useState(null); // group id from the link
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // A shared link lands as /?group=ABC123 — pick it up and offer to join.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('group');
    if (!id) return;
    // Clean the URL either way, so a refresh doesn't re-prompt.
    window.history.replaceState({}, '', window.location.pathname);
    if (!inGroup) setPendingJoin(id.toUpperCase());
  }, [ready, inGroup]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('soulmenu_customer');
      if (saved) setName(JSON.parse(saved).name || '');
    } catch {
      // no saved details — they'll type a name
    }
  }, []);

  const shareUrl = useMemo(
    () => (group ? `${window.location.origin}/?group=${group.id}` : ''),
    [group]
  );

  /* Everyone else's lines, priced from the menu this device already has. */
  const others = useMemo(() => {
    return otherLines
      .map((l) => {
        const item = menuIndex.get(String(l.itemId));
        if (!item) return null;
        const variation = l.variation
          ? (item.variations || []).find((v) => v.name === l.variation)
          : null;
        const unit = variation?.price ?? item.price;
        return {
          key: l.key,
          name: item.name,
          variation: l.variation,
          quantity: l.quantity,
          total: unit * l.quantity,
          who: memberName(l.memberId),
        };
      })
      .filter(Boolean);
  }, [otherLines, menuIndex, memberName]);

  const othersTotal = others.reduce((sum, l) => sum + l.total, 0);
  const groupTotal = othersTotal + mySubtotal;

  async function handleStart() {
    if (!name.trim()) return;
    setBusy(true);
    await start(name.trim());
    setBusy(false);
  }

  async function handleJoin() {
    if (!name.trim() || !pendingJoin) return;
    setBusy(true);
    const joined = await join(pendingJoin, name.trim());
    setBusy(false);
    if (joined) setPendingJoin(null);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the link is on screen to copy by hand
    }
  }

  function handleShare() {
    const text = `Join my Soul Cafe order: ${shareUrl}`;
    if (navigator.share) {
      navigator.share({ title: 'Soul Cafe group order', text, url: shareUrl }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    }
  }

  function handleHostCheckout() {
    collectForCheckout(menuIndex);
    onClose();
    // Give the cart update a frame to land before the page changes under it.
    setTimeout(() => onCheckout(), 60);
  }

  if (!open && !pendingJoin) return null;

  const showJoinPrompt = Boolean(pendingJoin) && !inGroup;

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet sheet--group"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Group order"
      >
        <div className="sheet__grabber" aria-hidden="true" />

        {error ? (
          <p className="form-error" onClick={clearError}>
            {error}
          </p>
        ) : null}

        {showJoinPrompt ? (
          <>
            <h2 className="sheet__title">Join the group order</h2>
            <p className="sheet__subtitle">
              You&rsquo;ve been invited to order together. Everything everyone picks goes on one
              bill, placed by whoever started it.
            </p>
            <div className="field">
              <label className="field__label">Your name</label>
              <input
                className="field__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="So the table knows whose latte is whose"
                maxLength={24}
              />
            </div>
            <button className="btn btn--primary" onClick={handleJoin} disabled={busy || !name.trim()}>
              {busy ? 'Joining…' : 'Join the order'}
            </button>
            <button className="btn btn--outline" onClick={() => setPendingJoin(null)}>
              No thanks, order on my own
            </button>
          </>
        ) : !inGroup ? (
          <>
            <h2 className="sheet__title">Order together</h2>
            <p className="sheet__subtitle">
              Share a link and everyone adds from their own phone. It all lands in one basket, and
              you place the single order at the end.
            </p>
            <div className="field">
              <label className="field__label">Your name</label>
              <input
                className="field__input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={24}
              />
            </div>
            <button className="btn btn--primary" onClick={handleStart} disabled={busy || !name.trim()}>
              {busy ? 'Starting…' : 'Start a group order'}
            </button>
          </>
        ) : (
          <>
            <h2 className="sheet__title">
              Group order
              <span className="group__code">{group.id}</span>
            </h2>

            <div className="group__people">
              {group.members.map((m) => (
                <span key={m.id} className={`group__person${m.host ? ' group__person--host' : ''}`}>
                  {m.name}
                  {m.host ? ' · host' : ''}
                </span>
              ))}
            </div>

            <div className="group__share">
              <button className="btn btn--primary" onClick={handleShare}>
                Share the link
              </button>
              <button className="btn btn--outline" onClick={handleCopy}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>

            <div className="group__basket">
              <h3 className="group__basket-title">Everyone&rsquo;s basket</h3>

              {myLines.length === 0 && others.length === 0 ? (
                <p className="group__empty">Nothing added yet. Start picking.</p>
              ) : null}

              {myLines.map((l) => (
                <div className="group__line" key={l.key}>
                  <span className="group__qty">{l.quantity}&times;</span>
                  <span className="group__item">
                    {l.name}
                    {l.variation ? <span className="group__var"> · {l.variation}</span> : null}
                    <span className="group__who">you</span>
                  </span>
                  <span className="group__total">{formatINR(l.unitPrice * l.quantity)}</span>
                </div>
              ))}

              {others.map((l) => (
                <div className="group__line" key={l.key}>
                  <span className="group__qty">{l.quantity}&times;</span>
                  <span className="group__item">
                    {l.name}
                    {l.variation ? <span className="group__var"> · {l.variation}</span> : null}
                    <span className="group__who">{l.who}</span>
                  </span>
                  <span className="group__total">{formatINR(l.total)}</span>
                </div>
              ))}

              <div className="group__sum">
                <span>Group total</span>
                <span>{formatINR(groupTotal)}</span>
              </div>
            </div>

            {group.closed ? (
              <p className="group__note">
                This group order has been placed{group.orderNumber ? ` — ${group.orderNumber}` : ''}.
              </p>
            ) : isHost ? (
              <>
                <button
                  className="btn btn--primary"
                  onClick={handleHostCheckout}
                  disabled={groupTotal <= 0}
                >
                  Place the group order &middot; {formatINR(groupTotal)}
                </button>
                <p className="group__note">
                  You started this group, so the order is yours to place. Everyone else&rsquo;s items
                  are added to your cart at checkout.
                </p>
              </>
            ) : (
              <p className="group__note group__note--wait">
                Add whatever you like — {hostName} places the order for everyone.
              </p>
            )}

            <button className="btn btn--outline" onClick={leave}>
              Leave the group
            </button>
          </>
        )}
      </div>
    </div>
  );
}
