import { getGroup, publicGroup } from '@/lib/groups';

export const dynamic = 'force-dynamic';

/** Current state of the group. Polled by every phone in it. */
export async function GET(request, { params }) {
  const { id } = await params;
  const group = await getGroup(id);
  if (!group) {
    return Response.json({ error: 'That group has expired or does not exist.' }, { status: 404 });
  }
  return Response.json(
    { group: publicGroup(group) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
