'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import {
  placeOrder,
  formatINR,
  validateCoupon,
  reverseGeocode,
  lookupCustomer,
} from '@/lib/api';
import { loadCustomer, saveCustomer, forgetCustomer } from '@/lib/customer';
import MapPicker from '@/components/MapPicker';
import HumanCheck from '@/components/HumanCheck';

// Falls back to the café itself, so the map always opens somewhere useful for
// a local delivery rather than mid-ocean.
const CAFE_LATLON = { lat: 19.1197, lon: 72.8464 };

// Delivery is free — kept as a constant so reinstating a fee is one edit here
// and one in the order API, which is the authority on what actually gets charged.
const DELIVERY_CHARGE = 0;

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

  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);       // { code, discount }
  const [couponMsg, setCouponMsg] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);

  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState('');
  const [pinnedAt, setPinnedAt] = useState(null);   // { lat, lon }
  const [mapOpen, setMapOpen] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState('');

  const [verification, setVerification] = useState({});
  const [knownCustomer, setKnownCustomer] = useState(null);
  const lookedUp = useRef(new Set());

  const deliveryCharge = orderType === 'delivery' ? DELIVERY_CHARGE : 0;
  const discount = coupon?.discount || 0;
  const total = Math.max(0, subtotal - discount + deliveryCharge);

  // A few items the café only hands over at the counter.
  const pickupOnly = lines.filter((l) => l.deliveryAvailable === false);
  const blockedByDelivery = orderType === 'delivery' && pickupOnly.length > 0;

  // An empty cart has nothing to check out.
  useEffect(() => {
    if (hydrated && lines.length === 0 && !submitting) router.replace('/');
  }, [hydrated, lines.length, submitting, router]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [key]: '' }));
  };

  // ---- returning customer -------------------------------------------------

  // Pre-fill from whatever this browser remembers, so a regular lands on a
  // filled-in form. A server-side match (PetPooja, or a recent order) is
  // preferred once a phone number is typed, since it also works on a new phone.
  useEffect(() => {
    const saved = loadCustomer();
    if (!saved) return;
    setKnownCustomer({ ...saved, source: 'device' });
    setForm((f) => ({
      ...f,
      name: f.name || saved.name || '',
      phone: f.phone || saved.phone || '',
      address: f.address || saved.address || '',
    }));
  }, []);

  const lookupByPhone = useCallback(
    async (digits) => {
      if (lookedUp.current.has(digits)) return;
      lookedUp.current.add(digits);
      try {
        const { customer, source } = await lookupCustomer(digits);
        if (!customer) return;
        setKnownCustomer({ ...customer, source });
        setForm((f) => ({
          ...f,
          name: f.name.trim() || customer.name || '',
          address: f.address.trim() || customer.address || '',
        }));
      } catch {
        // 404 just means we have not seen this number - not worth surfacing
      }
    },
    []
  );

  // Look up once the number is complete, not on every keystroke.
  useEffect(() => {
    const digits = form.phone.replace(/[^\d]/g, '');
    if (digits.length < 10) return undefined;
    const t = setTimeout(() => lookupByPhone(digits), 500);
    return () => clearTimeout(t);
  }, [form.phone, lookupByPhone]);

  const handleVerified = useCallback((token) => {
    setVerification(token || {});
    setFormError('');
  }, []);

  function handleForget() {
    forgetCustomer();
    setKnownCustomer(null);
    lookedUp.current.clear();
    setForm({ name: '', phone: '', address: '', notes: form.notes });
  }

  // ---- location -----------------------------------------------------------

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setLocateMsg('This browser cannot share a location.');
      return;
    }
    setLocating(true);
    setLocateMsg('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { address } = await reverseGeocode({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          setForm((f) => ({ ...f, address }));
          setFieldErrors((f) => ({ ...f, address: '' }));
          setPinnedAt({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setLocateMsg('Found you — add your flat or building number.');
        } catch (err) {
          setLocateMsg(err.message || 'Could not turn that into an address.');
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setLocateMsg(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — type the address instead.'
            : 'Could not get your location — type the address instead.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function handleMapConfirm({ lat, lon }) {
    setMapBusy(true);
    setMapError('');
    try {
      const { address } = await reverseGeocode({ lat, lon });
      setForm((f) => ({ ...f, address }));
      setFieldErrors((f) => ({ ...f, address: '' }));
      setPinnedAt({ lat, lon });
      setMapOpen(false);
      setLocateMsg('Pinned — add your flat or building number.');
    } catch (err) {
      // The pin is still worth keeping even with no readable address: the
      // rider gets a map link either way.
      setPinnedAt({ lat, lon });
      setMapError(err.message || 'Could not name that spot — the pin is saved anyway.');
    } finally {
      setMapBusy(false);
    }
  }

  // ---- coupon -------------------------------------------------------------

  async function handleApplyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg('');
    try {
      const result = await validateCoupon({ code, subtotal, orderType });
      setCoupon({ code: result.coupon.code, discount: result.discount });
      setCouponMsg(result.message);
    } catch (err) {
      setCoupon(null);
      setCouponMsg(err.message || "That code isn't valid.");
    } finally {
      setCouponBusy(false);
    }
  }

  function handleRemoveCoupon() {
    setCoupon(null);
    setCouponInput('');
    setCouponMsg('');
  }

  // A coupon can stop qualifying when the cart or order type changes, so drop
  // it and make the customer re-apply rather than showing a stale discount.
  useEffect(() => {
    if (!coupon) return;
    setCoupon(null);
    setCouponMsg('Cart changed — apply your code again.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, orderType]);

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
    if (blockedByDelivery) {
      setFormError(
        `${pickupOnly.map((l) => l.name).join(', ')} ${
          pickupOnly.length > 1 ? 'are' : 'is'
        } available for pickup only. Switch to pickup, or remove ${
          pickupOnly.length > 1 ? 'them' : 'it'
        } from your order.`
      );
      return;
    }
    if (!verification.turnstileToken && !verification.challengeToken) {
      setFormError('Please complete the verification below first.');
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { order } = await placeOrder({
        customerName: form.name.trim(),
        customerPhone: form.phone.replace(/[^\d+]/g, ''),
        customerAddress: orderType === 'delivery' ? form.address.trim() : '',
        orderType,
        paymentMethod,
        couponCode: coupon?.code || null,
        customerLat: pinnedAt?.lat ?? null,
        customerLon: pinnedAt?.lon ?? null,
        turnstileToken: verification.turnstileToken || null,
        challengeToken: verification.challengeToken || null,
        notes: form.notes.trim(),
        items: lines.map((l) => ({
          menuItemId: l.id,
          itemName: l.name,
          variation: l.variation,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        })),
      });

      saveCustomer({
        name: order.customerName,
        phone: order.customerPhone,
        address: order.customerAddress,
      });
      sessionStorage.setItem('soulmenu_last_order', JSON.stringify(order));
      clearCart();
      router.push('/confirmation');
    } catch (err) {
      setFormError(err.message || 'Could not place the order. Please try again.');
      setVerification({});
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
    <main className="page page-enter">
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

          <div className="coupon">
            {coupon ? (
              <div className="coupon__applied">
                <span className="coupon__tag">🎟️ {coupon.code}</span>
                <span className="coupon__saved">−{formatINR(coupon.discount)}</span>
                <button type="button" className="coupon__remove" onClick={handleRemoveCoupon}>
                  Remove
                </button>
              </div>
            ) : (
              <div className="coupon__row">
                <input
                  className="coupon__input"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCoupon();
                    }
                  }}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="coupon__apply"
                  onClick={handleApplyCoupon}
                  disabled={couponBusy || !couponInput.trim()}
                >
                  {couponBusy ? '…' : 'Apply'}
                </button>
              </div>
            )}
            {couponMsg ? (
              <p className={`coupon__msg${coupon ? ' coupon__msg--ok' : ''}`}>{couponMsg}</p>
            ) : null}
          </div>

          <div className="totals">
            <div className="totals__row">
              <span>Subtotal</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            {discount > 0 ? (
              <div className="totals__row totals__row--discount">
                <span>Discount · {coupon.code}</span>
                <span>−{formatINR(discount)}</span>
              </div>
            ) : null}
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
          {blockedByDelivery ? (
            <p className="form-error">
              {pickupOnly.map((l) => l.name).join(', ')}{' '}
              {pickupOnly.length > 1 ? 'are' : 'is'} available for pickup only.
            </p>
          ) : null}
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

          {knownCustomer ? (
            <div className="welcome">
              <span className="welcome__text">
                👋 Welcome back{knownCustomer.name ? `, ${knownCustomer.name.split(' ')[0]}` : ''} —
                we&apos;ve filled in your details.
              </span>
              <button type="button" className="welcome__clear" onClick={handleForget}>
                Not you?
              </button>
            </div>
          ) : null}

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
              <div className="field__labelrow">
                <label className="field__label" htmlFor="address">
                  Delivery Address
                </label>
                <span className="field__actions">
                  <button
                    type="button"
                    className="field__action"
                    onClick={handleUseLocation}
                    disabled={locating}
                  >
                    {locating ? 'Locating…' : '📍 Use my location'}
                  </button>
                  <button
                    type="button"
                    className="field__action"
                    onClick={() => {
                      setMapError('');
                      setMapOpen(true);
                    }}
                  >
                    🗺️ Pin on map
                  </button>
                </span>
              </div>
              <textarea
                id="address"
                className={`field__textarea${fieldErrors.address ? ' field__textarea--error' : ''}`}
                value={form.address}
                onChange={set('address')}
                placeholder="Flat / building, street, landmark"
                autoComplete="street-address"
              />
              {fieldErrors.address ? <p className="field__error">{fieldErrors.address}</p> : null}
              {locateMsg ? <p className="field__hint">{locateMsg}</p> : null}
              {pinnedAt ? (
                <p className="field__hint field__hint--pinned">
                  📍 Location pinned ({pinnedAt.lat.toFixed(5)}, {pinnedAt.lon.toFixed(5)}) — sent
                  to the café with your order.{' '}
                  <button
                    type="button"
                    className="field__inline-clear"
                    onClick={() => setPinnedAt(null)}
                  >
                    Clear
                  </button>
                </p>
              ) : null}
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

          <HumanCheck onToken={handleVerified} />

          {formError ? <p className="form-error">{formError}</p> : null}
        </section>
      </form>

      {mapOpen ? (
        <MapPicker
          initial={pinnedAt || CAFE_LATLON}
          busy={mapBusy}
          error={mapError}
          onCancel={() => setMapOpen(false)}
          onConfirm={handleMapConfirm}
        />
      ) : null}

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
