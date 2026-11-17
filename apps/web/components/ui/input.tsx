import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  /** Pesan galat; diumumkan lewat aria-live. */
  error?: string;
  /** Elemen di ujung kanan, misalnya tombol tampilkan kata sandi. */
  trailing?: ReactNode;
  forceState?: "hover" | "focus";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, trailing, forceState, className, ...rest },
  ref,
) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-force={forceState}
          // 16 px agar iOS tidak memperbesar halaman saat fokus (Rancangan §4.3).
          className={cn(
            "h-11 w-full rounded-sm border bg-surface px-3 text-base text-ink placeholder:text-ink-3",
            "disabled:cursor-not-allowed disabled:bg-status-none-bg disabled:text-ink-2",
            "data-[force=hover]:border-ink-2 hover:border-ink-2",
            error ? "border-status-absent-fg" : "border-line-strong",
            trailing ? "pr-12" : undefined,
          )}
          {...rest}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-caption text-ink-2">
          {hint}
        </p>
      ) : null}
      <p id={errorId} aria-live="polite" className="min-h-0 text-caption text-status-absent-fg">
        {error}
      </p>
    </div>
  );
});
