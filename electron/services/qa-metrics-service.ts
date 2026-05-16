import Store from "electron-store";
import { app } from "electron";
import type { DataIntegrityReport } from "../../shared/data-integrity-types.js";

export type IntegrityHistoryRow = {
  checkedAt: string;
  ok: boolean;
  findingCodes: string[];
  severityMax: string;
};

export type DeploymentCertRecord = {
  runAt: string;
  overallOk: boolean;
  checks: Array<{ id: string; ok: boolean; detail?: string }>;
};

type QaPersisted = {
  integrityHistory: IntegrityHistoryRow[];
  lastDeploymentCert: DeploymentCertRecord | null;
};

const defaults: QaPersisted = {
  integrityHistory: [],
  lastDeploymentCert: null,
};

const store = new Store<QaPersisted>({
  name: `${app.isPackaged ? "samy-soft-production" : "samy-soft-dev"}-qa`,
  defaults,
  clearInvalidConfig: false,
});

const MAX_ROWS = 80;

export function recordIntegrityScanResult(report: DataIntegrityReport): void {
  const rank: Record<string, number> = { info: 0, warning: 1, error: 2, critical: 3 };
  let maxRank = -1;
  for (const f of report.findings) {
    maxRank = Math.max(maxRank, rank[f.severity] ?? 0);
  }
  const order = ["info", "warning", "error", "critical"] as const;
  const severityMax = maxRank < 0 ? "info" : (order[maxRank] ?? "info");

  const findingCodes = report.findings.map((f) => f.code);

  const next: IntegrityHistoryRow = {
    checkedAt: report.checkedAt,
    ok: report.ok,
    findingCodes,
    severityMax,
  };
  const history = [...store.get("integrityHistory"), next];
  store.set("integrityHistory", history.slice(-MAX_ROWS));
}

export function recordDeploymentCert(cert: DeploymentCertRecord): void {
  store.set("lastDeploymentCert", cert);
}

export function getQaOverview(): QaPersisted {
  return {
    integrityHistory: store.get("integrityHistory"),
    lastDeploymentCert: store.get("lastDeploymentCert"),
  };
}
