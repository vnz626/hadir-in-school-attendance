import { STATUS_CODE, STATUS_ICON, STATUS_LABEL_KEY, type StatusKey } from "../../lib/status";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/cn";

const TINT: Record<StatusKey, string> = {
  present: "bg-status-present-bg text-status-present-fg",
  late: "bg-status-late-bg text-status-late-fg",
  excused: "bg-status-excused-bg text-status-excused-fg",
  sick: "bg-status-sick-bg text-status-sick-fg",
  dispensed: "bg-status-dispensed-bg text-status-dispensed-fg",
  absent: "bg-status-absent-bg text-status-absent-fg",
  none: "bg-status-none-bg text-status-none-fg",
  holiday: "bg-status-none-bg text-status-none-fg",
};

/** Ikon bentuk + label (+ kode huruf bila `showCode`): tidak pernah hanya warna. */
export function StatusPill({
  status,
  showCode = false,
  className,
}: {
  status: StatusKey;
  showCode?: boolean;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-caption font-semibold",
        TINT[status],
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {showCode ? <span aria-hidden>{STATUS_CODE[status]}</span> : null}
      <span>{t(STATUS_LABEL_KEY[status])}</span>
    </span>
  );
}
