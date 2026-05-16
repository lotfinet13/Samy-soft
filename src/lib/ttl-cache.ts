/**
 * Cache mémoire léger côté renderer — TTL court pour réduire les rafales IPC sans garantir fraîcheur stricte.
 * Données sensibles temps réel : TTL très bas ou pas de cache.
 */

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) });
}

export async function cacheGetOrSet<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const value = await fetcher();
  cacheSet(key, value, ttlMs);
  return value;
}

/** Invalide toutes les clés commençant par `prefix` (ex. `ipc:inventory:`). */
export function cacheInvalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
