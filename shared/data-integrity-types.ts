/**
 * Types métier pour le rapport de scan d’intégrité — partagés renderer ↔ process principal.
 */

export type IntegritySeverity = "critical" | "error" | "warning" | "info";

export type IntegrityFinding = {
  severity: IntegritySeverity;
  code: string;
  message: string;
  /** Action corrective suggérée (sans exécution automatique). */
  recommendation?: string;
  /** Avertissement exploitation / traçabilité métier sans nécessité d’arrêt système. */
  operationalWarning?: boolean;
  count?: number;
  sampleIds?: string[];
};

export type DataIntegrityReport = {
  checkedAt: string;
  /** Absence totale de findings `critical` ou `error` (warnings / info admis). */
  ok: boolean;
  findings: IntegrityFinding[];
};
