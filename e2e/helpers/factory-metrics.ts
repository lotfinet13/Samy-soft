import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ARTIFACT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "factory-simulation-metrics.json",
);

export type FactorySimStep = {
  id: string;
  area: string;
  ms: number;
  ok: boolean;
  detail?: string;
};

export type FactorySimSnapshot = {
  timestamp: string;
  steps: FactorySimStep[];
  notes: string[];
  memorySamples: Array<{ label: string; usedMb: number | null; totalMb: number | null }>;
};

export class FactoryMetrics {
  private readonly steps: FactorySimStep[] = [];
  private readonly notes: string[] = [];
  private readonly memorySamples: FactorySimSnapshot["memorySamples"] = [];

  note(message: string): void {
    this.notes.push(message);
  }

  async time<T>(id: string, area: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      this.steps.push({ id, area, ms: Date.now() - t0, ok: true });
      return result;
    } catch (error) {
      this.steps.push({
        id,
        area,
        ms: Date.now() - t0,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  record(id: string, area: string, ms: number, ok: boolean, detail?: string): void {
    this.steps.push({ id, area, ms, ok, detail });
  }

  async sampleMemory(page: import("@playwright/test").Page, label: string): Promise<void> {
    const sample = await page
      .evaluate(() => {
        const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
        if (!perf.memory) return null;
        return {
          usedMb: Math.round(perf.memory.usedJSHeapSize / 1024 / 1024),
          totalMb: Math.round(perf.memory.totalJSHeapSize / 1024 / 1024),
        };
      })
      .catch(() => null);
    this.memorySamples.push({
      label,
      usedMb: sample?.usedMb ?? null,
      totalMb: sample?.totalMb ?? null,
    });
  }

  flush(): void {
    const payload: FactorySimSnapshot = {
      timestamp: new Date().toISOString(),
      steps: this.steps,
      notes: this.notes,
      memorySamples: this.memorySamples,
    };
    fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
    fs.writeFileSync(ARTIFACT, JSON.stringify(payload, null, 2), "utf8");
  }

  static artifactPath(): string {
    return ARTIFACT;
  }
}
