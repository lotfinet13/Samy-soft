// @vitest-environment happy-dom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncLoad } from "../../src/hooks/useAsyncLoad.ts";

describe("useAsyncLoad", () => {
  it("loads data on mount and exposes result", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    const { result } = renderHook(() => useAsyncLoad(loader, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ ok: true });
    expect(result.current.error).toBeNull();
  });

  it("surfaces loader errors and supports retry", async () => {
    let calls = 0;
    const loader = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("IPC timeout");
      return "recovered";
    });

    const { result } = renderHook(() => useAsyncLoad(loader, [], { toastOnError: false }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/IPC timeout/);

    await result.current.reload();
    await waitFor(() => expect(result.current.data).toBe("recovered"));
  });

  it("respects timeoutMs", async () => {
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("late"), 5000);
        }),
    );

    const { result } = renderHook(() =>
      useAsyncLoad(loader, [], { timeoutMs: 200, toastOnError: false }),
    );

    await waitFor(() => expect(result.current.error).toMatch(/Délai dépassé/), { timeout: 3000 });
    expect(result.current.data).toBeNull();
  }, 10_000);
});
