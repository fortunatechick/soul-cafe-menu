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
  const [state, setState] = useState('idle'); // idle | returned | reported
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
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
        setState('returned');
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

  async function report(paid) {
    if (!paid) {
      setState('idle');
      return;
    }
    if (utr.trim() && !isValidUtr(utr)) {
      setError('A UPI reference number is 12 digits. Leave it blank if you can’t find it.');
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

  if (state === 'reported') {
    return (
      <div className="pay pay--done">
        <span className="pay__tick" aria-hidden="true">✓</span>
        <h2 className="pay__title">Payment reported</h2>
        <p className="pay__note">
          The café checks {formatINR(amount)} against its UPI account before starting your order.
          {utr ? ` Reference ${utr}.` : ''} Send the WhatsApp message below so they see it straight away.
        </p>
      </div>
    );
  }

  return (
    <div className="pay">
      <div className="pay__head">
        <div>
          <h2 className="pay__title">Pay {formatINR(amount)}</h2>
          <p className="pay__sub">UPI · {PAYEE_NAME}</p>
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

      {state === 'returned' ? (
        <div className="pay__back">
          <p className="pay__back-q">Did the payment go through?</p>
          <div className="field">
            <label className="field__label" htmlFor="utr">
              UPI reference number <span className="pay__optional">optional, helps the café find it</span>
            </label>
            <input
              id="utr"
              className="field__input"
              value={utr}
              onChange={(e) => setUtr(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
              placeholder="12 digits from your UPI app"
              inputMode="numeric"
            />
          </div>
          {error ? <p className="field__error">{error}</p> : null}
          <div className="pay__back-actions">
            <button className="btn btn--primary" onClick={() => report(true)} disabled={busy}>
              {busy ? 'Sending…' : 'Yes, I’ve paid'}
            </button>
            <button className="btn btn--outline" onClick={() => report(false)} disabled={busy}>
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <>
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
          <button type="button" className="pay__already" onClick={() => setState('returned')}>
            I’ve already paid
          </button>
        </>
      )}

      <p className="pay__fineprint">
        Amount and order number are built into the QR, so there is nothing to type.
        The café confirms the payment in its own UPI account before making your order.
      </p>
    </div>
  );
}
