'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatINR } from '@/lib/api';
import { encodeQR, qrPath } from '@/lib/qr';
import { UPI_ID, PAYEE_NAME, upiUri, upiAmount, appLinks, isValidUtr } from '@/lib/upi';

/**
 * Pay for an order over UPI: a scannable QR, and buttons that open a UPI app.
 *
 * The QR carries the payee, the exact amount and the order number, so the
 * customer never types a figure and the café can match the payment to a ticket.
 *
 * Coming back is the awkward part. Handing someone to a UPI app is a one-way
 * trip — nothing in the spec returns them here — so instead the page notices
 * when the tab becomes visible again and asks how it went. That is the closest
 * a website can get to a return journey.
 *
 * Nothing here proves a payment happened. Without a gateway there is no webhook,
 * so what the customer reports is recorded as a claim and the café checks it.
 */
export default function UpiPayment({ order, onReported }) {
  const [state, setState] = useState('idle'); // idle | reported
  const [returned, setReturned] = useState(false); // came back from a UPI app
  const [utr, setUtr] = useState(order.paymentClaim?.utr || '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  const [pasteHint, setPasteHint] = useState('');
  const leftForApp = useRef(false);

  const amount = order.total;
  const link = useMemo(
    () => upiUri({ amount, orderNumber: order.orderNumber }),
    [amount, order.orderNumber]
  );
  const apps = useMemo(
    () => appLinks({ amount, orderNumber: order.orderNumber }),
    [amount, order.orderNumber]
  );

  // The QR is generated here rather than fetched — no third-party image service
  // gets to see what the café is charging whom.
  const qr = useMemo(() => {
    try {
      const { modules, size } = encodeQR(link);
      return { d: qrPath(modules), size };
    } catch {
      return null; // too long to encode; the buttons and the VPA still work
    }
  }, [link]);

  /* Watch for the customer coming back from their UPI app. */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && leftForApp.current && state === 'idle') {
        leftForApp.current = false;
        setReturned(true);
        // Put the cursor where the next action is, since nothing brought them
        // back here automatically.
        setTimeout(() => document.getElementById('utr')?.focus(), 300);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [state]);

  function openApp() {
    leftForApp.current = true;
    // If nothing claimed the scheme the tab never hid, so drop the flag and
    // leave the QR as the way to pay.
    setTimeout(() => {
      if (document.visibilityState === 'visible') leftForApp.current = false;
    }, 2500);
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // clipboard blocked — the value is on screen to copy by hand
    }
  }

  /**
   * Pull the transaction ID off the clipboard.
   *
   * Every UPI app offers a copy or share on its receipt, and what comes across
   * is usually a whole line — "UPI Ref No 123456789012" — rather than the bare
   * number, so the first twelve-digit run is taken out of whatever is there.
   * The browser asks the customer before handing the clipboard over, which is
   * why this is a button and not something that happens on its own.
   */
  async function pasteReference() {
    setError('');
    try {
      const text = await navigator.clipboard.readText();
      const found = String(text || '').match(/\d{12}/);
      if (!found) {
        setPasteHint(
          text?.trim()
            ? "That doesn't look like a transaction ID — copy it from your UPI receipt."
            : 'Nothing on the clipboard yet — copy the reference from your UPI app first.'
        );
        return;
      }
      setUtr(found[0]);
      setPasteHint('');
    } catch {
      setPasteHint('This browser won’t share the clipboard — type the 12 digits instead.');
    }
  }

  async function report() {
    // The reference is optional. Every payment already carries the order number
    // in its note, so the café can match it without one; requiring twelve digits
    // just stopped people confirming an order they had genuinely paid for.
    if (utr && !isValidUtr(utr)) {
      setError('A transaction ID is 12 digits. Clear it, or paste the full reference.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/orders/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          phone: order.customerPhone,
          utr: utr.trim(),
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setState('reported');
        onReported?.(utr.trim());
      }
    } catch {
      setError('Could not reach the café. Please send the WhatsApp message below instead.');
    }
    setBusy(false);
  }

  // Derived, not initial state: the order's payment status arrives from the
  // server a moment after this mounts, and a useState initialiser would have
  // already run with the stale value — leaving a paid order still asking to be
  // paid.
  const done = state === 'reported' || order.paymentStatus === 'claimed';
  const reference = utr || order.paymentClaim?.utr || '';

  if (done) {
    return (
      <div className="pay pay--done">
        <span className="pay__tick" aria-hidden="true">✓</span>
        <h2 className="pay__title">Payment reported</h2>
        <p className="pay__note">
          The café checks {formatINR(amount)} against its UPI account before starting your order.
          {reference ? ` Reference ${reference}.` : ''} Send the WhatsApp message below so they see it straight away.
        </p>
      </div>
    );
  }

  return (
    <div className="pay">
      <div className="pay__head">
        <div>
          <h2 className="pay__title">Pay by UPI</h2>
          <p className="pay__sub">{PAYEE_NAME}</p>
        </div>
        <span className="pay__amount">{formatINR(amount)}</span>
      </div>

      {qr ? (
        <div className="pay__qrwrap">
          <svg
            className="pay__qr"
            viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
            role="img"
            aria-label={`UPI QR code to pay ${formatINR(amount)} to ${PAYEE_NAME}`}
            shapeRendering="crispEdges"
          >
            {/* The quiet zone is part of the code — without it, scanners struggle. */}
            <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#ffffff" />
            <path d={qr.d} fill="#0d2233" />
          </svg>
          <p className="pay__scan">Scan with any UPI app</p>
        </div>
      ) : null}

      <div className="pay__vpa">
        <div>
          <span className="pay__vpa-label">UPI ID</span>
          <span className="pay__vpa-id">{UPI_ID}</span>
        </div>
        <button type="button" className="pay__copy" onClick={() => copy(UPI_ID, 'vpa')}>
          {copied === 'vpa' ? 'Copied' : 'Copy'}
        </button>
      </div>

      <a className="btn btn--primary pay__go" href={link} onClick={openApp}>
        Open a UPI app
      </a>
      <div className="pay__apps">
        {apps.map((app) => (
          <a key={app.id} className="pay__app" href={app.href} onClick={openApp}>
            {app.label}
          </a>
        ))}
      </div>

      {/* Always on screen rather than behind an "already paid?" button. This is
          the step that turns a held order into a confirmed one, so it should
          never need finding. */}
      <div className={`pay__confirm${returned ? ' pay__confirm--live' : ''}`}>
        <h3 className="pay__confirm-title">
          {returned ? 'Welcome back — confirm your payment' : 'Already paid? Confirm it here'}
        </h3>
        <p className="pay__confirm-hint">
          If your UPI app gave you a reference, copy it and hit Paste — it helps
          the café find your payment faster. Not required: your order number is
          already on the payment, so you can just confirm.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="utr">
            Transaction ID <span className="pay__optional">optional</span>
          </label>
          <div className="utr">
            <input
              id="utr"
              className="field__input"
              value={utr}
              onChange={(e) => {
                setUtr(e.target.value.replace(/[^0-9]/g, '').slice(0, 12));
                if (error) setError('');
                if (pasteHint) setPasteHint('');
              }}
              placeholder="12 digits"
              inputMode="numeric"
              autoComplete="off"
            />
            <button type="button" className="utr__paste" onClick={pasteReference}>
              Paste
            </button>
          </div>
          <p className="field__hint">
            {pasteHint || (utr ? `${utr.length}/12` : 'Leave blank if you can’t find it')}
          </p>
        </div>
        {error ? <p className="field__error">{error}</p> : null}
        <button
          className="btn btn--primary"
          onClick={report}
          disabled={busy}
        >
          {busy ? 'Confirming…' : 'Confirm payment'}
        </button>
      </div>

      <p className="pay__fineprint">
        Amount and order number are built into the QR, so there is nothing to type.
        The café checks the transaction ID against its own UPI account before making
        your order — entering it here is what confirms the order, not the payment itself.
      </p>
    </div>
  );
}
