/**
 * Renderer-side TTL cache key prefixes (`cacheGetOrSet` / `cacheInvalidatePrefix`).
 * Mutations métier invalident au minimum le préfixe du domaine concerné.
 */

export const CACHE_KEYS = {
  INVENTORY_DASHBOARD_SUMMARY: "ipc:inventory:dashboard:summary",
} as const;

export const CACHE_PREFIX = {
  INVENTORY: "ipc:inventory:",
  PRODUCTION: "ipc:production:",
  SALES: "ipc:sales:",
  HR: "ipc:hr:",
  REPORTS: "ipc:reports:",
} as const;
