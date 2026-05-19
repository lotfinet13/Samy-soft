import { useRef, useCallback, type KeyboardEvent, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type Table,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/cn";

function StaticTableMessage<TData>({
  table,
  columnCount,
  message,
}: {
  table: Table<TData>;
  columnCount: number;
  message: ReactNode;
}) {
  return (
    <div className="overflow-auto rounded-2xl border border-border bg-surface-elevated shadow-sm">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-surface-muted">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    "border-b border-border px-4 py-4 text-left text-sm font-semibold text-foreground",
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          <tr>
            <td
              className="px-4 py-10 text-center text-base text-foreground-muted"
              colSpan={columnCount}
            >
              {message}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  /** When true, shows a loading row instead of empty/data. */
  loading?: boolean;
  loadingLabel?: string;
  emptyLabel?: string;
  /** Nombre minimum de lignes pour activer la virtualisation (défaut : 18). `false` = jamais. */
  virtualizeThreshold?: number | false;
  /** Hauteur max. de la zone scrollable lorsque virtualisé. */
  virtualMaxHeight?: string;
  /** Hauteur estimée d’une ligne (px), alignée sur py-4 + texte. */
  estimatedRowHeight?: number;
};

function isSamyE2eMode(): boolean {
  return typeof globalThis !== "undefined" && (globalThis as { __SAMY_E2E__?: boolean }).__SAMY_E2E__ === true;
}

export function DataTable<TData>(props: DataTableProps<TData>) {
  const defaultThreshold = isSamyE2eMode() ? Infinity : 18;
  const threshold =
    props.virtualizeThreshold === false ? Infinity : (props.virtualizeThreshold ?? defaultThreshold);
  const maxH = props.virtualMaxHeight ?? "min(70vh, 640px)";
  const rowH = props.estimatedRowHeight ?? 52;
  const emptyLabel = props.emptyLabel ?? "Aucune donnée disponible.";
  const loadingLabel = props.loadingLabel ?? "Chargement…";

  const table = useReactTable({
    data: props.data,
    columns: props.columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const rows = table.getRowModel().rows;

  if (props.loading) {
    return (
      <StaticTableMessage table={table} columnCount={props.columns.length} message={loadingLabel} />
    );
  }

  if (rows.length === 0) {
    return (
      <StaticTableMessage table={table} columnCount={props.columns.length} message={emptyLabel} />
    );
  }

  if (rows.length < threshold) {
    return (
      <div className="overflow-auto rounded-2xl border border-border bg-surface-elevated shadow-sm">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-surface-muted">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "border-b border-border px-4 py-4 text-left text-sm font-semibold text-foreground",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={cn(idx % 2 === 1 ? "bg-surface-muted/60" : "bg-surface-elevated")}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border-b border-border px-4 py-4 align-top text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <VirtualizedTableBody
      table={table}
      rows={rows}
      maxHeight={maxH}
      estimatedRowHeight={rowH}
    />
  );
}

function VirtualizedTableBody<TData>({
  rows,
  table,
  maxHeight,
  estimatedRowHeight,
}: {
  table: Table<TData>;
  rows: Row<TData>[];
  maxHeight: string;
  estimatedRowHeight: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 12,
  });

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        el.scrollBy({ top: estimatedRowHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        el.scrollBy({ top: -estimatedRowHeight, behavior: "smooth" });
      } else if (e.key === "PageDown") {
        e.preventDefault();
        el.scrollBy({ top: Math.floor(el.clientHeight * 0.85), behavior: "smooth" });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        el.scrollBy({ top: -Math.floor(el.clientHeight * 0.85), behavior: "smooth" });
      }
    },
    [estimatedRowHeight],
  );

  const items = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="region"
      aria-label="Données tableau — flèches pour défiler"
      className="rounded-2xl border border-border bg-surface-elevated shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]"
      style={{ maxHeight, overflow: "auto" }}
      onKeyDown={onKeyDown}
    >
      <table className="w-full min-w-full border-separate border-spacing-0" style={{ display: "block" }}>
        <thead
          className="sticky top-0 z-[2] bg-surface-muted shadow-[0_1px_0_rgb(var(--color-border))]"
          style={{ display: "block" }}
        >
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="flex w-full min-w-full">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    "flex flex-1 basis-0 border-b border-border px-4 py-3 text-left text-sm font-semibold text-foreground",
                  )}
                  style={{ minWidth: 0 }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            display: "block",
            position: "relative",
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {items.map((vRow) => {
            const row = rows[vRow.index];
            if (!row) return null;
            return (
              <tr
                key={row.id}
                data-index={vRow.index}
                className={cn(
                  "flex w-full min-w-full border-b border-border",
                  vRow.index % 2 === 1 ? "bg-surface-muted/60" : "bg-surface-elevated",
                )}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: `${vRow.size}px`,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="flex flex-1 basis-0 items-start border-border px-4 py-3 align-top text-sm"
                    style={{ minWidth: 0 }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
