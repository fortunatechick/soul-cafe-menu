import { replaceMemberLines, publicGroup } from '@/lib/groups';

export const dynamic = 'force-dynamic';

/**
 * Replace one member's entire set of lines with what their cart holds.
 *
 * Sending the whole cart rather than one change at a time is what makes a
 * removal reliable: whatever is absent from the list is absent from the group,
 * so a dropped request can never leave a deleted item on everyone else's screen.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = await replaceMemberLines(id, body.memberId, body.lines);
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return Response.json({ group: publicGroup(result.group) });
}
