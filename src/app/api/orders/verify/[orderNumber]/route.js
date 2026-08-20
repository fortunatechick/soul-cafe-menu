import { getOrder } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { orderNumber } = await params;
  const order = getOrder(String(orderNumber || '').toUpperCase());

  if (!order) {
    return Response.json({ error: 'Order not found.' }, { status: 404 });
  }

  return Response.json({ order });
}
