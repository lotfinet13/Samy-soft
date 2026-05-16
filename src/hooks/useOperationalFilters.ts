import { useCallback, useMemo, useState } from "react";

const STORAGE = "samy-soft:filters:v1";

type Bucket = Record<string, { recent: string[]; saved: Record<string, string> }>;

function loadBucket(): Bucket {
  try {
    const raw = window.localStorage.getItem(STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Bucket;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeBucket(bucket: Bucket): void {
  try {
    window.localStorage.setItem(STORAGE, JSON.stringify(bucket));
  } catch {
    /* ignore quota */
  }
}

export type OperationalChip = { kind: "recent" | "saved"; label: string; query: string };

/**
 * Récent·s recherches, filtres enregistrés et persistance légère (localStorage).
 */
export function useOperationalFilters(namespace: string) {
  const [revision, bump] = useState(0);

  const store = useMemo(() => loadBucket()[namespace] ?? { recent: [], saved: {} }, [namespace, revision]);

  function persist(next: NonNullable<Bucket[string]>): void {
    const all = loadBucket();
    all[namespace] = next;
    writeBucket(all);
    bump((n) => n + 1);
  }

  const pushRecent = useCallback(
    (q: string) => {
      const term = q.trim();
      if (term.length < 2) return;
      const cur = loadBucket()[namespace] ?? { recent: [], saved: {} };
      const merged = [term, ...cur.recent.filter((x) => x !== term)].slice(0, 8);
      persist({ ...cur, recent: merged });
    },
    [namespace],
  );

  const savePreset = useCallback(
    (name: string, query: string) => {
      const label = name.trim();
      if (!label) return;
      const cur = loadBucket()[namespace] ?? { recent: [], saved: {} };
      persist({ ...cur, saved: { ...cur.saved, [label]: query } });
    },
    [namespace],
  );

  const removePreset = useCallback(
    (name: string) => {
      const cur = loadBucket()[namespace] ?? { recent: [], saved: {} };
      const { [name]: _, ...rest } = cur.saved;
      persist({ ...cur, saved: rest });
    },
    [namespace],
  );

  const chips: OperationalChip[] = useMemo(() => {
    const out: OperationalChip[] = [];
    for (const r of store.recent.slice(0, 6)) {
      out.push({ kind: "recent", label: r, query: r });
    }
    for (const [label, query] of Object.entries(store.saved)) {
      out.push({ kind: "saved", label, query });
    }
    return out;
  }, [store]);

  return { chips, pushRecent, savePreset, removePreset };
}
