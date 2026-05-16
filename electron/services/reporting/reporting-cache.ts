const store = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 45_000;

/** Cache léger TTL pour agrégats lourds (centre KPIs / cockpit). */
export async function withReportCache<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit != null && now - hit.at < TTL_MS) {
    return Promise.resolve(hit.value as T);
  }
  const value = await factory();
  store.set(key, { at: now, value });
  return value;
}

export function reportCacheBump(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
