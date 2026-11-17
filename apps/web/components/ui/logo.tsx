import { cn } from "../../lib/cn";

/** Logo: kata "hadir" huruf kecil bobot 800 dengan titik kuning pensil (satu-satunya kuning di luar sesi aktif). */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn("text-h3 font-extrabold tracking-tight text-ink", className)}
      aria-label="hadir.in"
    >
      hadir
      <span aria-hidden className="text-live">
        .
      </span>
    </span>
  );
}
