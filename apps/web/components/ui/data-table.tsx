"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/cn";
import { EmptyState } from "./empty-state";
import { ErrorState, PartialNotice } from "./state-panels";
import { SkeletonRows } from "./skeleton";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Angka dirata-kanankan (Rancangan §4.4). */
  numeric?: boolean;
  sortable?: boolean;
  /** Kolom nama menempel di kiri saat digulir (Rancangan §4.6). */
  sticky?: boolean;
  /** Di daftar mobile: tampil selebar baris tanpa label (untuk kolom aksi). */
  mobileFull?: boolean;
}

export interface SortState {
  key: string;
  direction: "asc" | "desc";
}

export type TableState = "loading" | "ready" | "error";

const ROW_HEIGHT = 44;
const VIRTUAL_THRESHOLD = 100;
const VIEWPORT_HEIGHT = 560;
const OVERSCAN = 8;
const MOBILE_PAGE = 100;

/**
 * Baris berpembatas tipis, header lengket, kolom pertama lengket bila `sticky`. Di atas 100 baris
 * tabel desktop memakai virtual scroll. Di bawah md tabel menjadi daftar baris (Rancangan §8).
 * Kelima keadaan layar ditangani di sini: memuat, kosong, galat, sebagian, dan (di tingkat halaman) tanpa akses.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowId,
  state = "ready",
  sort,
  onSortChange,
  onRowClick,
  onRetry,
  partialNotice,
  emptyTitle = t("state.emptyTitle"),
  emptyDescription = t("table.empty"),
  emptyAction,
}: {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  state?: TableState;
  sort?: SortState;
  onSortChange?: (next: SortState) => void;
  onRowClick?: (row: T) => void;
  onRetry?: () => void;
  partialNotice?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [mobileLimit, setMobileLimit] = useState(MOBILE_PAGE);

  if (state === "loading") return <SkeletonRows rows={6} />;
  if (state === "error") return <ErrorState onRetry={onRetry} />;
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const virtual = rows.length > VIRTUAL_THRESHOLD;
  const first = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN) : 0;
  const last = virtual
    ? Math.min(rows.length, Math.ceil((scrollTop + VIEWPORT_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
    : rows.length;
  const visible = rows.slice(first, last);

  const cellClass = (c: Column<T>) =>
    cn("px-3 text-sm", c.numeric ? "text-right tabular-nums" : "text-left");

  const sortButton = (c: Column<T>) => {
    const active = sort?.key === c.key;
    const next: SortState = {
      key: c.key,
      direction: active && sort?.direction === "asc" ? "desc" : "asc",
    };
    return (
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1 font-semibold"
        onClick={() => onSortChange?.(next)}
      >
        {c.header}
        {active ? (
          sort?.direction === "asc" ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )
        ) : null}
        {active ? (
          <span className="sr-only">
            {sort?.direction === "asc" ? t("table.sortedAsc") : t("table.sortedDesc")}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col">
      {partialNotice ? <PartialNotice message={partialNotice} onRetry={onRetry} /> : null}

      {/* Desktop dan tablet: tabel. */}
      <div
        className="hidden overflow-auto border-y border-line bg-surface md:block"
        style={virtual ? { maxHeight: VIEWPORT_HEIGHT } : undefined}
        onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      >
        <table className="w-full border-collapse">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line-strong">
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort?.key === c.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cn(
                    cellClass(c),
                    "h-11 font-semibold text-ink-2",
                    (c.sticky ?? i === 0) && "sticky left-0 z-20 bg-surface",
                  )}
                >
                  {c.sortable && onSortChange ? sortButton(c) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {virtual && first > 0 ? (
              <tr aria-hidden style={{ height: first * ROW_HEIGHT }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}
            {visible.map((row) => (
              <tr
                key={getRowId(row)}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  "border-b border-line",
                  onRowClick && "cursor-pointer hover:bg-primary-tint",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={cn(
                      cellClass(c),
                      (c.sticky ?? i === 0) && "sticky left-0 bg-surface font-semibold",
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {virtual && last < rows.length ? (
              <tr aria-hidden style={{ height: (rows.length - last) * ROW_HEIGHT }}>
                <td colSpan={columns.length} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile: daftar baris, bukan tabel. */}
      <ul aria-label={caption} className="border-y border-line bg-surface md:hidden">
        {rows.slice(0, mobileLimit).map((row) => (
          <li
            key={getRowId(row)}
            className={cn(
              "flex flex-col gap-1 border-b border-line px-4 py-3",
              onRowClick && "active:bg-primary-tint",
            )}
          >
            {onRowClick ? (
              <button
                type="button"
                className="flex min-h-11 flex-col gap-1 text-left"
                onClick={() => onRowClick(row)}
              >
                <MobileCells columns={columns} row={row} />
              </button>
            ) : (
              <MobileCells columns={columns} row={row} />
            )}
          </li>
        ))}
        {rows.length > mobileLimit ? (
          <li className="px-4 py-3">
            <button
              type="button"
              className="min-h-11 font-semibold text-primary"
              onClick={() => setMobileLimit((n) => n + MOBILE_PAGE)}
            >
              {t("table.showMore", { count: rows.length - mobileLimit })}
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function MobileCells<T>({ columns, row }: { columns: readonly Column<T>[]; row: T }) {
  return (
    <>
      {columns.map((c, i) =>
        c.mobileFull ? (
          <div key={c.key} className="-mx-2 flex flex-wrap items-center pt-1">
            {c.cell(row)}
          </div>
        ) : (
          <div
            key={c.key}
            className={cn("flex justify-between gap-3 text-sm", i === 0 && "font-semibold")}
          >
            {i === 0 ? null : <span className="text-ink-2">{c.header}</span>}
            <span className={cn(i === 0 ? "" : "text-right", c.numeric && "tabular-nums")}>
              {c.cell(row)}
            </span>
          </div>
        ),
      )}
    </>
  );
}
