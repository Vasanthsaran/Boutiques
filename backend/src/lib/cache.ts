/**
 * Tiny in-process cache for public read endpoints.
 * Every admin write calls invalidatePublic(), so published changes appear immediately.
 * With several server instances, keep the short TTL (or swap for Redis) so other
 * instances converge within PUBLIC_TTL_MS.
 */
const PUBLIC_TTL_MS = 30_000;
const store = new Map<string, { expires: number; value: unknown }>();

export async function cached<T>(key: string, fn: () => Promise<T>, ttl = PUBLIC_TTL_MS): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { expires: Date.now() + ttl, value });
  if (store.size > 500) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires <= now) store.delete(k);
    if (store.size > 500) store.clear();
  }
  return value;
}

export function invalidatePublic() {
  store.clear();
}
