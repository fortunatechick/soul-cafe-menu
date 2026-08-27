'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/api';
import { WA_NUMBER } from '@/lib/contact';
import UpiPayment from '@/components/UpiPayment';

const PAYMENT_LABEL = {
  upi: 'UPI',
};

export default function ConfirmationPage() {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);
  const [paidRef, setPaidRef] = useState(null); // transaction ID the customer gave

  // Confirmed means the customer has given us a transaction ID, here or on an
  // earlier visit. It does not mean the money has been verified — only the café
  // can do that, against its own UPI account.
  const confirmed = paidRef !== null || order?.paymentStatus === 'claimed';
  const itemCount = (order?.items || []).reduce((n, i) => n + i.quantity, 0);

  useEffect(() => {
    let saved = null;
    try {
      const raw = sessionStorage.getItem('soulmenu_last_order');
      if (raw) saved = JSON.parse(raw);
    } catch {
      // corrupt payload — treated as no order below
    }
    if (!saved) {
      setMissing(true);
      return;
    }
    setOrder(saved);

    // The copy in sessionStorage was written when the order was placed, so it
    // still says "awaiting" even after the payment has been confirmed. Ask the
    // server, which is the one that knows, or a reload sends the customer back
    // to a payment screen for something they have already paid.
    (async () => {
      try {
        const res = await fetch(`/api/orders/verify/${saved.orderNumber}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const live = data.order || data;
        if (!live?.paymentStatus) return;
        const merged = {
          ...saved,
          paymentStatus: live.paymentStatus,
          paymentClaim: live.paymentClaim || saved.paymentClaim || null,
        };
        setOrder(merged);
        try {
          sessionStorage.setItem('soulmenu_last_order', JSON.stringify(merged));
        } catch {
          // storage full — the in-memory copy is still correct for this view
        }
      } catch {
        // offline — the stored copy is what we have
      }
    })();
  }, []);

  if (missing) {
    return (
      <main className="page">
        <div className="state">
          <span className="state__emoji">☕</span>
          <p className="state__text">No recent order to show.</p>
          <button className="btn btn--outline" onClick={() => router.push('/')}>
            Back to Menu
          </button>
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="page">
        <div className="state">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  const waText = [
    `Order ${order.orderNumber} placed on the Soul website.`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    `${order.orderType === 'delivery' ? `Address: ${order.customerAddress}` : 'Pickup from the café'}`,
    ...(order.customerLocation
      ? [
          `Map: https://www.google.com/maps/search/?api=1&query=${order.customerLocation.lat},${order.customerLocation.lon}`,
        ]
      : []),
    `Payment: ${PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod}`,
    ...(paidRef !== null
      ? [`Paid via UPI${paidRef ? ` — reference ${paidRef}` : ' (no reference given)'}`]
      : []),
    '',
    ...order.items.map(
      (i) => `${i.quantity} × ${i.itemName}${i.variation ? ` (${i.variation})` : ''} — ${formatINR(i.lineTotal)}`
    ),
    '',
    ...(order.discount > 0
      ? [`Discount${order.couponCode ? ` (${order.couponCode})` : ''}: -${formatINR(order.discount)}`]
      : []),
    `Total: ${formatINR(order.total)}`,
  ].join('\n');

  const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waText)}`;

  return (
    <main className="page page-enter">
      <div className="container confirm">
        {/* An order is not "placed" until it is paid for. Saying so before the
            money moves is the kind of small lie a customer notices later, at
            the counter, when nothing is ready. */}
        <span className="confirm__emoji">{confirmed ? '🎉' : '💳'}</span>
        <h1 className="confirm__title">
          {confirmed ? 'Order confirmed' : 'Almost there — pay to confirm'}
        </h1>
        <p className="confirm__sub">
          {confirmed
            ? `Thanks ${order.customerName}! The café is checking your payment and will start your order.`
            : `${order.customerName}, we're holding this order. Pay below and enter your transaction ID to confirm it.`}
        </p>

        <div className="ordercard">
          <p className="ordercard__label">Order Number</p>
          <p className="ordercard__number">{order.orderNumber}</p>
        </div>

        <UpiPayment
          order={order}
          onReported={(ref) => {
            setPaidRef(ref);
            const merged = {
              ...order,
              paymentStatus: 'claimed',
              paymentClaim: { utr: ref, at: new Date().toISOString() },
            };
            setOrder(merged);
            try {
              sessionStorage.setItem('soulmenu_last_order', JSON.stringify(merged));
            } catch {
              // storage full — this view is already correct
            }
          }}
        />

        {/* A receipt, not a list of database rows: what you ordered reads
            differently from what it cost, and the quantity is a badge rather
            than something buried in the middle of the item name. */}
        <section className="orderdetail">
          <header className="orderdetail__head">
            <h2 className="orderdetail__title">Your order</h2>
            <span className="orderdetail__count">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          </header>

          <ul className="orderdetail__items">
            {order.items.map((i) => (
              <li className="oitem" key={`${i.menuItemId}-${i.variation || ''}`}>
                <span className="oitem__qty">{i.quantity}</span>
                <span className="oitem__body">
                  <span className="oitem__name">{i.itemName}</span>
                  {i.variation ? <span className="oitem__var">{i.variation}</span> : null}
                </span>
                <span className="oitem__price">{formatINR(i.lineTotal)}</span>
              </li>
            ))}
          </ul>

          <div className="orderdetail__lines">
            {order.discount > 0 ? (
              <>
                <div className="oline">
                  <span>Subtotal</span>
                  <span>{formatINR(order.subtotal)}</span>
                </div>
                <div className="oline oline--save">
                  <span>Discount{order.couponCode ? ` · ${order.couponCode}` : ''}</span>
                  <span>−{formatINR(order.discount)}</span>
                </div>
              </>
            ) : null}
            <div className="oline">
              <span>{order.orderType === 'delivery' ? 'Delivery' : 'Pickup'}</span>
              <span>{order.deliveryCharge ? formatINR(order.deliveryCharge) : 'Free'}</span>
            </div>
          </div>

          <div className="orderdetail__total">
            <span>Total</span>
            <span>{formatINR(order.total)}</span>
          </div>
        </section>

        <div className="confirm__actions">
          <a className="btn btn--whatsapp" href={waUrl} target="_blank" rel="noopener noreferrer">
            💬 Confirm on WhatsApp
          </a>
          <button className="btn btn--outline" onClick={() => router.push('/')}>
            Order More
          </button>
        </div>

        <p className="confirm__note">
          {paidRef !== null
            ? 'Send the WhatsApp message so the café can match your payment and start the order.'
            : 'Pay above, then send the WhatsApp message so the café can confirm your order.'}
        </p>
      </div>
    </main>
  );
}
