import { fetchCustomer } from '@/lib/petpooja';
import { findOrderByPhone } from '@/lib/store';

export const dynamic = 'force-dynamic';

/**
 * Returning-customer lookup, best source first:
 *
 *   1. PetPooja, when credentials are configured — the café's own record, and
 *      the only source that knows about orders placed in-store or by phone.
 *   2. This process's order store, which covers a repeat order in the same
 *      session but not much more (see src/lib/store.js on why).
 *
 * The browser also remembers the last order locally and uses that when both of
 * the above come back empty, so the feature works today with no backend.
 */
export async function GET(_request, { params }) {
  const { phone } = await params;
  const digits = String(phone || '').replace(/[^\d]/g, '');

  if (digits.length < 10 || digits.length > 13) {
    return Response.json({ error: 'Invalid phone number.' }, { status: 400 });
  }

  const pos = await fetchCustomer(digits);
  if (pos.customer) {
    return Response.json({ customer: pos.customer, source: 'petpooja' });
  }

  const previous = findOrderByPhone(digits);
  if (previous) {
    return Response.json({
      customer: {
        name: previous.customerName,
        phone: previous.customerPhone,
        address: previous.customerAddress || '',
      },
      source: 'recent-order',
    });
  }

  return Response.json(
    { customer: null, posConfigured: pos.configured },
    { status: 404 }
  );
}
