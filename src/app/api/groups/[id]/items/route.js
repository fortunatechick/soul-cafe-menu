import { setGroupLine, publicGroup } from '@/lib/groups';

export const dynamic = 'force-dynamic';

/**
 * Set one member's quantity for one item. Quantity 0 removes the line.
 *
 * The host may pass targetMemberId to clear somebody else's item before the
 * order goes in.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = await setGroupLine(id, body.memberId, {
    itemId: body.itemId,
    variation: body.variation,
    quantity: body.quantity,
    hostToken: body.hostToken,
    targetMemberId: body.targetMemberId,
  });

  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ group: publicGroup(result.group) });
}
