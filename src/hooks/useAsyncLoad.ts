import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { logger } from "@/lib/logger";
import { notifyFromError } from "@/lib/notify";

const DEFAULT_TIMEOUT_MS = 60_000;

export type UseAsyncLoadOptions = {
  immediate?: boolean;
  toastOnError?: boolean;
  retries?: number;
  /** Abort load after this many ms (default 60s). */
  timeoutMs?: number;
};

export type UseAsyncLoadResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<T | null>;
  setData: Dispatch<SetStateAction<T | null>>;
};

export function useAsyncLoad<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  options?: UseAsyncLoadOptions,
): UseAsyncLoadResult<T> {
  const immediate = options?.immediate ?? true;
  const toastOnError = options?.toastOnError ?? true;
  const retries = options?.retries ?? 0;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async (): Promise<T | null> => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await Promise.race([
          loader(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Délai dépassé (${Math.round(timeoutMs / 1000)} s).`)), timeoutMs);
          }),
        ]);
        if (mountedRef.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
    }

    const message = lastError instanceof Error ? lastError.message : "Chargement impossible.";
    logger.error("async-load", message, lastError);
    if (mountedRef.current) {
      setError(message);
      setLoading(false);
    }
    if (toastOnError) notifyFromError(lastError);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies deps
  }, deps);

  useEffect(() => {
    if (!immediate) return;
    void reload();
  }, [immediate, reload]);

  return { data, loading, error, reload, setData };
}
