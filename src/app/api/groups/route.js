import { createGroup, publicGroup, MAX_MEMBER_NAME } from '@/lib/groups';
import { checkRateLimit, clientIp } from '@/lib/ratelimit';
import { cleanText } from '@/lib/limits';

export const dynamic = 'force-dynamic';

/** Start a group. The caller becomes the host and gets the only host token. */
export async function POST(request) {
  const ip = clientIp(request);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return Response.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = cleanText(body.name, MAX_MEMBER_NAME);
  if (!name) return Response.json({ error: 'Please add your name first.' }, { status: 400 });

  const group = await createGroup(name);

  // The token goes back exactly once, to the device that made the group.
  return Response.json({
    group: publicGroup(group),
    hostToken: group.hostToken,
    memberId: group.hostId,
  });
}
