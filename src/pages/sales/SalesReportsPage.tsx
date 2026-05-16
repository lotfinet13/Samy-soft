import { IPC_CHANNELS } from "@shared/ipc-channels";
import { PERMISSIONS } from "@shared/permissions";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCsvUtf8 } from "@/lib/csv-download";
import { samyInvoke } from "@/lib/samy";

type SalesCsvChannel =
  | typeof IPC_CHANNELS.SALES_REPORT_REVENUE_CSV
  | typeof IPC_CHANNELS.SALES_REPORT_INVOICES_CSV
  | typeof IPC_CHANNELS.SALES_REPORT_TOP_PRODUCTS_CSV
  | typeof IPC_CHANNELS.SALES_REPORT_PAYMENTS_CSV;

function monthRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function SalesReportsPage() {
  const { can } = usePermissions();
  const ok = can(PERMISSIONS.SALES_REPORT);
  const [from, setFrom] = useState(() => monthRange().from.slice(0, 10));
  const [to, setTo] = useState(() => monthRange().to.slice(0, 10));

  const rangeIso = () => ({
    from: new Date(from + "T00:00:00.000Z").toISOString(),
    to: new Date(to + "T23:59:59.999Z").toISOString(),
  });

  async function pullCsv(channel: SalesCsvChannel, name: string): Promise<void> {
    const payload = rangeIso();
    const res = await samyInvoke<{ csv: string }>(channel, payload);
    downloadCsvUtf8(`samy-${name}-${from}_${to}.csv`, res.csv);
  }

  async function balancesCsv(): Promise<void> {
    const res = await samyInvoke<{ csv: string }>(IPC_CHANNELS.SALES_REPORT_BALANCES_CSV);
    downloadCsvUtf8(`samy-ventes-soldes-${from}.csv`, res.csv);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Rapports commerciaux"
        subtitle="Exports CSV UTF-8 — PDF / Excel natifs prévus via couche impression & bibliothèque tableur."
      />

      {!ok ? <p className="text-[12px] text-danger">Permission sales.report requise.</p> : null}

      <section className="erp-panel flex flex-wrap items-end gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Du
          <input type="date" className="control-chrome h-9 px-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-foreground-muted">
          Au
          <input type="date" className="control-chrome h-9 px-2" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReportTile
          title="CA & factures détaillées"
          description="Montants HT/TVA/TTC par facture validée."
          disabled={!ok}
          onClick={() => void pullCsv(IPC_CHANNELS.SALES_REPORT_REVENUE_CSV, "ca-detail")}
        />
        <ReportTile
          title="Historique factures"
          description="Toutes factures sur la période."
          disabled={!ok}
          onClick={() => void pullCsv(IPC_CHANNELS.SALES_REPORT_INVOICES_CSV, "factures")}
        />
        <ReportTile
          title="Top produits"
          description="Quantités et CA par SKU vendu."
          disabled={!ok}
          onClick={() => void pullCsv(IPC_CHANNELS.SALES_REPORT_TOP_PRODUCTS_CSV, "top-produits")}
        />
        <ReportTile
          title="Paiements"
          description="Flux encaissements datés."
          disabled={!ok}
          onClick={() => void pullCsv(IPC_CHANNELS.SALES_REPORT_PAYMENTS_CSV, "paiements")}
        />
        <ReportTile title="Soldes clients" description="Factures avec solde résiduel (instantané)." disabled={!ok} onClick={() => void balancesCsv()} />
      </div>
    </div>
  );
}

function ReportTile(props: {
  title: string;
  description: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className="erp-panel flex flex-col gap-1 rounded-[var(--erp-radius-panel)] p-4 text-left hover:bg-surface-elevated disabled:opacity-40"
      onClick={props.onClick}
    >
      <span className="text-[13px] font-semibold">{props.title}</span>
      <span className="text-[11px] leading-snug text-foreground-muted">{props.description}</span>
      <span className="mt-2 text-[11px] font-bold uppercase text-accent">Télécharger CSV</span>
    </button>
  );
}
