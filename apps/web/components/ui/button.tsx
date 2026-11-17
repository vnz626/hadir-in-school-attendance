import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Hanya untuk katalog: memaksa tampilan hover/tekan agar bisa ditinjau tanpa interaksi. */
  forceState?: "hover" | "pressed";
}

// Tinggi 44 di mobile, 40 di desktop (Rancangan §4.6). Target sentuh tidak pernah di bawah 44 di mobile.
const base =
  "inline-flex h-11 items-center justify-center gap-2 rounded-sm px-4 text-sm font-semibold transition-colors duration-[var(--dur-fast)] lg:h-10 disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-press active:bg-primary-press data-[force=hover]:bg-primary-press data-[force=pressed]:bg-primary-press",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-primary-tint active:bg-primary-tint data-[force=hover]:bg-primary-tint data-[force=pressed]:bg-primary-tint",
  ghost:
    "text-primary hover:bg-primary-tint active:bg-primary-tint data-[force=hover]:bg-primary-tint data-[force=pressed]:bg-primary-tint",
  // Latar solid absent kurang dari 4,5:1 dengan teks putih, jadi tombol bahaya memakai varian teks (-fg).
  danger:
    "bg-status-absent-fg text-white hover:brightness-90 active:brightness-90 data-[force=hover]:brightness-90 data-[force=pressed]:brightness-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    loading = false,
    forceState,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-force={forceState}
      className={cn(base, variants[variant], className)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden className="size-5 animate-spin" strokeWidth={1.75} />
      ) : null}
      {children}
    </button>
  );
});
