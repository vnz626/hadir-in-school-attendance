import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { t } from "../../lib/i18n";
import { Button } from "./button";

/** Keadaan galat: apa yang salah, cara memperbaiki, dan tombol coba lagi (Rancangan §6.10). */
export function ErrorState({
  title = t("state.errorTitle"),
  description = t("common.genericError"),
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-12">
      <TriangleAlert aria-hidden className="size-6 text-status-absent-fg" strokeWidth={1.75} />
      <h2 className="text-h3">{title}</h2>
      <p className="max-w-[70ch] text-body text-ink-2">{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

/** Keadaan tanpa akses (403) dengan penjelasan. */
export function ForbiddenState({ action }: { action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-12">
      <h2 className="text-h3">{t("state.forbiddenTitle")}</h2>
      <p className="max-w-[70ch] text-body text-ink-2">{t("state.forbiddenBody")}</p>
      {action}
    </div>
  );
}

/** Keadaan sebagian: data parsial tetap ditampilkan, ada penanda jelas. */
export function PartialNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 border-b border-line bg-status-late-bg px-4 py-3 text-sm text-status-late-fg"
    >
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="min-h-11 shrink-0 px-2 font-semibold underline"
          onClick={onRetry}
        >
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}
