import { closeGroup, publicGroup } from '@/lib/groups';

export const dynamic = 'force-dynamic';

/** Host only: the group is now an order, so nobody keeps adding to it. */
export async function POST(request, { params }) {
  const { id } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = await closeGroup(id, body.hostToken, body.orderNumber);
  if (result.error) return Response.json({ error: result.error }, { status: 403 });
  return Response.json({ group: publicGroup(result.group) });
}
