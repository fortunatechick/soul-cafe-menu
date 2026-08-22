import { issueChallenge, turnstileConfigured } from '@/lib/botcheck';

export const dynamic = 'force-dynamic';

/**
 * Hands the browser a short-lived signed token for the human check. Only used
 * when Turnstile is not configured — with Turnstile the widget supplies its own
 * token and this endpoint is not called.
 */
export async function GET() {
  if (turnstileConfigured()) {
    return Response.json({ mode: 'turnstile' });
  }
  const { token } = issueChallenge();
  return Response.json({ mode: 'challenge', token });
}
