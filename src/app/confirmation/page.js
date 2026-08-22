'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatINR } from '@/lib/api';

const WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '917032257595';

const PAYMENT_LABEL = {
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
};

export default function ConfirmationPage() {
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('soulmenu_last_order');
      if (saved) setOrder(JSON.parse(saved));
      else setMissing(true);
    } catch {
      setMissing(true);
    }
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
    `Payment: ${PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod}`,
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
    <main className="page">
      <div className="container confirm">
        <span className="confirm__emoji">🎉</span>
        <h1 className="confirm__title">Order Placed!</h1>
        <p className="confirm__sub">Thank you, {order.customerName}!</p>

        <div className="ordercard">
          <p className="ordercard__label">Order Number</p>
          <p className="ordercard__number">{order.orderNumber}</p>
        </div>

        <div className="receipt">
          {order.items.map((i) => (
            <div className="receipt__row" key={`${i.menuItemId}-${i.variation || ''}`}>
              <span>
                {i.itemName}
                {i.variation ? ` · ${i.variation}` : ''} × {i.quantity}
              </span>
              <span>{formatINR(i.lineTotal)}</span>
            </div>
          ))}
          {order.discount > 0 ? (
            <div className="receipt__row receipt__row--discount">
              <span>Discount{order.couponCode ? ` · ${order.couponCode}` : ''}</span>
              <span>−{formatINR(order.discount)}</span>
            </div>
          ) : null}
          <div className="receipt__row">
            <span>{order.orderType === 'delivery' ? 'Delivery' : 'Pickup'}</span>
            <span>{order.deliveryCharge ? formatINR(order.deliveryCharge) : 'Free'}</span>
          </div>
          <div className="receipt__row">
            <span>Payment</span>
            <span>{PAYMENT_LABEL[order.paymentMethod] || order.paymentMethod}</span>
          </div>
          <div className="receipt__row receipt__row--total">
            <span>Total</span>
            <span>{formatINR(order.total)}</span>
          </div>
        </div>

        <div className="confirm__actions">
          <a className="btn btn--whatsapp" href={waUrl} target="_blank" rel="noopener noreferrer">
            💬 Confirm on WhatsApp
          </a>
          <button className="btn btn--outline" onClick={() => router.push('/')}>
            Order More
          </button>
        </div>

        <p className="confirm__note">
          Send the WhatsApp message so the café can confirm your order and share payment details.
        </p>
      </div>
    </main>
  );
}
