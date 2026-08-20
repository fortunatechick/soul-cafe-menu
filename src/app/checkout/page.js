'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { placeOrder, formatINR } from '@/lib/api';

const DELIVERY_CHARGE = 30;

const PAYMENT_OPTIONS = [
  { id: 'upi', emoji: '📱', label: 'UPI', hint: 'Pay online — link sent on WhatsApp' },
  { id: 'cash', emoji: '💵', label: 'Cash', hint: 'Pay on delivery or at the counter' },
  { id: 'card', emoji: '💳', label: 'Card', hint: 'Card machine at delivery or counter' },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, hydrated, subtotal, updateQuantity, clearCart } = useCart();

  const [orderType, setOrderType] = useState('delivery');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const deliveryCharge = orderType === 'delivery' ? DELIVERY_CHARGE : 0;
  const total = subtotal + deliveryCharge;

  // An empty cart has nothing to check out.
  useEffect(() => {
    if (hydrated && lines.length === 0 && !submitting) router.replace('/');
  }, [hydrated, lines.length, submitting, router]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [key]: '' }));
  };

  function validate() {
    const errors = {};
    if (form.name.trim().length < 2) errors.name = 'Please enter your name.';

    const digits = form.phone.replace(/[^\d]/g, '');
    if (digits.length < 10 || digits.length > 13) {
      errors.phone = 'Enter a valid phone number (10–13 digits).';
    }
    if (orderType === 'delivery' && form.address.trim().length < 10) {
      errors.address = 'Enter a full delivery address.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { order } = await placeOrder({
        customerName: form.name.trim(),
        customerPhone: form.phone.replace(/[^\d+]/g, ''),
        customerAddress: orderType === 'delivery' ? form.address.trim() : '',
        orderType,
        paymentMethod,
        notes: form.notes.trim(),
        items: lines.map((l) => ({
          menuItemId: l.id,
          itemName: l.name,
          variation: l.variation,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        })),
      });

      sessionStorage.setItem('soulmenu_last_order', JSON.stringify(order));
      clearCart();
      router.push('/confirmation');
    } catch (err) {
      setFormError(err.message || 'Could not place the order. Please try again.');
      setSubmitting(false);
    }
  }

  if (!hydrated || lines.length === 0) {
    return (
      <main className="page">
        <div className="state">
          <div className="spinner" />
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="topbar">
        <div className="topbar__inner">
          <Link href="/" className="topbar__back" aria-label="Back to menu">
            ←
          </Link>
          <span className="topbar__title">Checkout</span>
        </div>
      </div>

      <form className="container checkout" onSubmit={handleSubmit}>
        <section className="block">
          <h2 className="block__title">Your Order</h2>
          {lines.map((l) => (
            <div className="lineitem" key={l.key}>
              <div className="lineitem__body">
                <p className="lineitem__name">{l.name}</p>
                <p className="lineitem__meta">
                  {l.variation ? `${l.variation} · ` : ''}
                  {formatINR(l.unitPrice)} each
                </p>
              </div>
              <div className="qty">
                <button
                  type="button"
                  className="qty__btn"
                  onClick={() => updateQuantity(l.key, l.quantity - 1)}
                  aria-label={`Remove one ${l.name}`}
                >
                  −
                </button>
                <span className="qty__count">{l.quantity}</span>
                <button
                  type="button"
                  className="qty__btn"
                  onClick={() => updateQuantity(l.key, l.quantity + 1)}
                  aria-label={`Add one ${l.name}`}
                >
                  +
                </button>
              </div>
              <span className="lineitem__price">{formatINR(l.unitPrice * l.quantity)}</span>
            </div>
          ))}

          <div className="totals">
            <div className="totals__row">
              <span>Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            <div className="totals__row">
              <span>{orderType === 'delivery' ? 'Delivery' : 'Pickup'}</span>
              <span>{deliveryCharge ? formatINR(deliveryCharge) : 'Free'}</span>
            </div>
            <div className="totals__row totals__row--grand">
              <span>Total</span>
              <span>{formatINR(total)}</span>
            </div>
          </div>
        </section>

        <section className="block">
          <h2 className="block__title">Order Type</h2>
          <div className="segment">
            {[
              { id: 'delivery', emoji: '🛵', label: 'Delivery' },
              { id: 'pickup', emoji: '🏪', label: 'Pickup' },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                className={`segment__opt${orderType === o.id ? ' segment__opt--active' : ''}`}
                onClick={() => setOrderType(o.id)}
                aria-pressed={orderType === o.id}
              >
                <span className="segment__emoji">{o.emoji}</span>
                {o.label}
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <h2 className="block__title">Payment Method</h2>
          <div className="segment segment--stack">
            {PAYMENT_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`segment__opt${paymentMethod === o.id ? ' segment__opt--active' : ''}`}
                onClick={() => setPaymentMethod(o.id)}
                aria-pressed={paymentMethod === o.id}
              >
                <span className="segment__emoji">{o.emoji}</span>
                <span className="segment__label">
                  {o.label}
                  <span className="segment__hint">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <h2 className="block__title">Your Details</h2>

          <div className="field">
            <label className="field__label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className={`field__input${fieldErrors.name ? ' field__input--error' : ''}`}
              value={form.name}
              onChange={set('name')}
              placeholder="Your name"
              autoComplete="name"
            />
            {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className={`field__input${fieldErrors.phone ? ' field__input--error' : ''}`}
              value={form.phone}
              onChange={set('phone')}
              placeholder="10-digit mobile number"
              inputMode="tel"
              autoComplete="tel"
            />
            {fieldErrors.phone ? <p className="field__error">{fieldErrors.phone}</p> : null}
          </div>

          {orderType === 'delivery' ? (
            <div className="field">
              <label className="field__label" htmlFor="address">
                Delivery Address
              </label>
              <textarea
                id="address"
                className={`field__textarea${fieldErrors.address ? ' field__textarea--error' : ''}`}
                value={form.address}
                onChange={set('address')}
                placeholder="Flat / building, street, landmark"
                autoComplete="street-address"
              />
              {fieldErrors.address ? <p className="field__error">{fieldErrors.address}</p> : null}
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="notes">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              className="field__textarea"
              value={form.notes}
              onChange={set('notes')}
              placeholder="Less sugar, extra napkins…"
            />
          </div>

          {formError ? <p className="form-error">{formError}</p> : null}
        </section>
      </form>

      <div className="footer-cta">
        <div className="footer-cta__inner">
          <button
            className="btn btn--primary"
            onClick={handleSubmit}
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Placing order…' : `Place Order · ${formatINR(total)}`}
          </button>
        </div>
      </div>
    </main>
  );
}
