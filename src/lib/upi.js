/**
 * UPI payment links for Soul Café.
 *
 * A UPI URI is just a query string the payment app reads:
 *
 *   upi://pay?pa=<vpa>&pn=<payee name>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
 *
 * Two things are worth knowing about what this can and cannot do.
 *
 * There is no return trip. Opening a UPI app from a mobile browser hands the
 * user to another app, and nothing in the UPI spec brings them back to the page
 * afterwards — the `url` parameter is a merchant link some apps display, not a
 * redirect. Native apps get a result through an Android intent; a website does
 * not. So the page watches for the tab becoming visible again and asks how it
 * went, which is as close to a return as the platform allows.
 *
 * And a link cannot confirm a payment. Without a payment gateway there is no
 * webhook, so the site never learns whether money moved. Anything the customer
 * reports here is a claim, recorded as one, for the café to check against its
 * own UPI app before making the order.
 */

/** The café's collecting account. Overridable without touching code. */
export const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID || 'paytm.s1wylvd@pty';
export const PAYEE_NAME = process.env.NEXT_PUBLIC_UPI_NAME || 'Soul Cafe';

/**
 * UPI is strict about these fields, and apps differ in how strictly. Anything
 * outside letters, digits, spaces and a few marks is dropped rather than
 * escaped, because a note that fails validation can make an app reject the
 * whole link.
 */
const cleanNote = (text, max = 45) =>
  String(text || '')
    .replace(/[^A-Za-z0-9 .\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/** The reference is alphanumeric only — the hyphen in SOUL-ABC123 has to go. */
const cleanRef = (text) =>
  String(text || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 35);

/** Amount as UPI wants it: plain digits, two decimals, no separators. */
export const upiAmount = (value) => Math.max(0, Number(value) || 0).toFixed(2);

/**
 * Build the UPI URI for one order.
 *
 * @param {{amount: number, orderNumber?: string, note?: string, scheme?: string}} opts
 */
export function upiUri({ amount, orderNumber, note, scheme = 'upi://pay' } = {}) {
  const params = new URLSearchParams();
  params.set('pa', UPI_ID);
  params.set('pn', PAYEE_NAME);
  params.set('am', upiAmount(amount));
  params.set('cu', 'INR');

  const tn = cleanNote(note || (orderNumber ? `Soul Cafe order ${orderNumber}` : 'Soul Cafe order'));
  if (tn) params.set('tn', tn);

  const tr = cleanRef(orderNumber);
  if (tr) params.set('tr', tr);

  // Two encoding fixes URLSearchParams gets wrong for UPI:
  //   "+" for a space shows up literally in some apps' notes; %20 always works.
  //   "@" in the payee address is left as-is, the way every real UPI QR writes
  //   it — it is a legal query character, and apps have been known to reject
  //   the percent-encoded form.
  return `${scheme}?${params.toString().replace(/\+/g, '%20').replace(/%40/g, '@')}`;
}

/**
 * The same payment, addressed to one app.
 *
 * The generic `upi://` scheme opens Android's app chooser, but on iOS nothing
 * claims it — each app registers its own scheme instead. These give an iPhone
 * user a working button rather than a link that does nothing.
 */
export const UPI_APPS = [
  { id: 'gpay', label: 'Google Pay', scheme: 'tez://upi/pay' },
  { id: 'phonepe', label: 'PhonePe', scheme: 'phonepe://pay' },
  { id: 'paytm', label: 'Paytm', scheme: 'paytmmp://pay' },
];

export const appLinks = (opts) =>
  UPI_APPS.map((app) => ({ ...app, href: upiUri({ ...opts, scheme: app.scheme }) }));

/** A UTR is the 12-digit reference a UPI app shows after a successful payment. */
export const isValidUtr = (value) => /^[0-9]{12}$/.test(String(value || '').trim());
