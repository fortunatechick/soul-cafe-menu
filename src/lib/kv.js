/**
 * Tiny Redis client over the Upstash REST API.
 *
 * Group ordering needs several phones to see the same basket, and in-process
 * memory cannot do that: on Vercel each request may land on a different
 * serverless instance, so one phone's group is invisible to the next. That is
 * not a rare edge — it is what made a refresh look like it dropped the host out
 * of their own group.
 *
 * This talks to the REST endpoint with plain fetch rather than pulling in
 * @vercel/kv, which keeps the dependency list where the rest of the project
 * keeps it: empty. Set KV_REST_API_URL and KV_REST_API_TOKEN (Vercel KV and
 * Upstash both provide exactly these) and it switches on by itself.
 *
 * With nothing configured, `ready` is false and the caller falls back to memory,
 * which is correct for local development and for a single-instance deployment.
 */

const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

/** Whether a shared store is configured. */
export const ready = Boolean(URL_BASE && TOKEN);

/**
 * Run one Redis command. Returns the raw `result`, or null if the call failed —
 * a group read that fails should look like "not loaded", never like "deleted".
 */
async function command(args) {
  if (!ready) return null;
  try {
    const res = await fetch(URL_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Every field of a hash, as a plain object with values JSON-parsed.
 *
 * A group is stored as a hash rather than one JSON blob so that two phones
 * editing at the same moment write different fields. Read-modify-write on a
 * single blob would lose whichever update landed second, which for a shared
 * basket means someone's coffee quietly vanishing.
 */
export async function hgetall(key) {
  const flat = await command(['HGETALL', key]);
  if (!flat || !Array.isArray(flat) || flat.length === 0) return null;

  const out = {};
  for (let i = 0; i < flat.length; i += 2) {
    try {
      out[flat[i]] = JSON.parse(flat[i + 1]);
    } catch {
      out[flat[i]] = flat[i + 1];
    }
  }
  return out;
}

export async function hset(key, field, value, ttlSeconds) {
  const ok = await command(['HSET', key, field, JSON.stringify(value)]);
  if (ok !== null && ttlSeconds) await command(['EXPIRE', key, ttlSeconds]);
  return ok !== null;
}

export async function hdel(key, field) {
  return (await command(['HDEL', key, field])) !== null;
}
