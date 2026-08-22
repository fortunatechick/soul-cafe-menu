/**
 * What the browser remembers about the person ordering.
 *
 * This is the fallback that makes returning-customer autofill work with no
 * backend at all: after a successful order the details are kept in
 * localStorage (not sessionStorage — it has to outlive the tab), and the next
 * visit pre-fills from it. A server-side match, whether PetPooja or a recent
 * order, is preferred when available because it also works on a new device.
 *
 * Stored on the customer's own device, cleared by them with "Not you?".
 */

const KEY = 'soulmenu_customer';

export function loadCustomer() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.phone) return null;
    return saved;
  } catch {
    return null;
  }
}

export function saveCustomer({ name, phone, address }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ name, phone, address: address || '', savedAt: new Date().toISOString() })
    );
  } catch {
    // private mode or a full quota — autofill is a convenience, not a
    // requirement, so failing to remember is not worth surfacing
  }
}

export function forgetCustomer() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
