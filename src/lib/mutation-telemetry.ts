import { logger } from "@/lib/logger";

export type MutationEvent = {
  at: string;
  area: string;
  ok: boolean;
  message?: string;
};

const MAX = 40;
const ring: MutationEvent[] = [];

export function recordMutation(area: string, ok: boolean, message?: string): void {
  ring.push({ at: new Date().toISOString(), area, ok, message });
  if (ring.length > MAX) ring.shift();
  if (!ok) logger.error("mutation", area, message);
}

export function getRecentMutations(): readonly MutationEvent[] {
  return ring;
}
