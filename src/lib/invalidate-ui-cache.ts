import { CACHE_PREFIX } from "@/lib/cache-keys";
import { cacheInvalidatePrefix } from "@/lib/ttl-cache";

/** Résumés inventaire et caches TTL associés au domaine stocks. */
export function invalidateInventoryCaches(): void {
  cacheInvalidatePrefix(CACHE_PREFIX.INVENTORY);
}

export function invalidateProductionCaches(): void {
  cacheInvalidatePrefix(CACHE_PREFIX.PRODUCTION);
}

export function invalidateSalesCaches(): void {
  cacheInvalidatePrefix(CACHE_PREFIX.SALES);
}

export function invalidateHrCaches(): void {
  cacheInvalidatePrefix(CACHE_PREFIX.HR);
}

export function invalidateReportsCaches(): void {
  cacheInvalidatePrefix(CACHE_PREFIX.REPORTS);
}
