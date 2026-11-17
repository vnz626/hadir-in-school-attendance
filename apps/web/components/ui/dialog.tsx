"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/cn";

/**
 * Dialog di desktop, bottom sheet di mobile (Rancangan §4.6). Radix mengunci fokus dan menutup
 * dengan Esc. `side` dipakai panel samping formulir data master.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  variant = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  variant?: "dialog" | "side";
}) {
  // Dialog dikendalikan dari luar (tanpa Dialog.Trigger), jadi Radix tidak tahu ke mana fokus harus
  // kembali. Catat elemen yang aktif tepat saat dialog dibuka, lalu pulihkan saat ditutup.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          {...(description ? {} : { "aria-describedby": undefined })}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
          className={cn(
            "fixed z-50 flex max-h-[90dvh] flex-col gap-4 overflow-y-auto bg-surface p-6 shadow-float",
            // Mobile: bottom sheet.
            "inset-x-0 bottom-0 rounded-t-md",
            variant === "dialog"
              ? "md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(32rem,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-md"
              : "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-md",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="text-h3">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm text-ink-2">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label={t("common.close")}
              className="flex size-11 shrink-0 items-center justify-center rounded-sm text-ink-2 hover:bg-primary-tint"
            >
              <X aria-hidden className="size-5" strokeWidth={1.75} />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
