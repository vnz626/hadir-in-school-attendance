import { cn } from "../../lib/cn";
import { t } from "../../lib/i18n";

/** Pengganti spinner penuh layar (Rancangan §4.6). Animasi mati bila prefers-reduced-motion. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("rounded-sm bg-line", className)}
      style={{ animation: "skeleton-pulse 1.4s ease-in-out infinite" }}
    />
  );
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-2", className)}>
      <span className="sr-only">{t("common.loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
