import { joinGroup, publicGroup } from '@/lib/groups';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const limit = checkRateLimit(clientIp(request));
  if (!limit.allowed) {
    return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  const { id } = await params;
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = await joinGroup(id, body.name);
  if (result.error) return Response.json({ error: result.error }, { status: 400 });

  return Response.json({ group: publicGroup(result.group), memberId: result.member.id });
}
