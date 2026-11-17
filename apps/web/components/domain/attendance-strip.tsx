import { t } from "../../lib/i18n";
import { cn } from "../../lib/cn";
import { STATUS_LABEL_KEY, type StatusKey } from "../../lib/status";

export interface StripDay {
  date: string;
  status: StatusKey;
}

/**
 * Lajur kehadiran (Rancangan §4.6, §22.4): satu segmen per hari sekolah. Hari di luar masa
 * terdaftar siswa TIDAK dikirim ke komponen ini. Harus diletakkan di atas `surface`.
 */
export function AttendanceStrip({
  days,
  className,
  size = "md",
}: {
  days: readonly StripDay[];
  className?: string;
  size?: "md" | "lg";
}) {
  const counts = new Map<StatusKey, number>();
  for (const d of days) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);
  const summary = [...counts.entries()]
    .map(([s, n]) => `${n} ${t(STATUS_LABEL_KEY[s]).toLowerCase()}`)
    .join(", ");

  return (
    <div
      role="img"
      aria-label={`Riwayat kehadiran: ${summary || "belum ada data"}`}
      className={cn("flex gap-[3px] overflow-x-auto bg-surface", className)}
    >
      {days.map((d) => {
        const hollow = d.status === "none" || d.status === "holiday";
        return (
          <span
            key={d.date}
            title={`${d.date}: ${t(STATUS_LABEL_KEY[d.status])}`}
            className={cn(
              "shrink-0 rounded-seg",
              size === "lg" ? "h-8 w-3" : "h-5 w-2",
              d.status === "none" && "border-[1.5px] border-status-none-border",
              d.status === "holiday" && "border border-dashed border-line-strong",
            )}
            style={hollow ? undefined : { background: `var(--s-${d.status})` }}
          />
        );
      })}
    </div>
  );
}
