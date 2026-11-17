import type { ReactNode } from "react";
import { AttendanceStrip, type StripDay } from "../domain/attendance-strip";
import { Logo } from "../ui/logo";
import { t } from "../../lib/i18n";
import type { StatusKey } from "../../lib/status";

// Riwayat contoh deterministik untuk latar kiri (dekoratif): bukan data siswa mana pun.
const PATTERN: StatusKey[] = [
  "present",
  "present",
  "present",
  "present",
  "late",
  "present",
  "present",
  "excused",
  "present",
  "present",
  "present",
  "sick",
  "present",
  "present",
  "absent",
  "present",
  "present",
  "present",
  "present",
  "dispensed",
  "present",
  "present",
  "present",
  "late",
  "present",
  "present",
  "present",
  "present",
  "holiday",
  "present",
];

const ROWS: StripDay[][] = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 48 }, (_, i) => ({
    date: `${r}-${i}`,
    status: PATTERN[(i * 7 + r * 11) % PATTERN.length]!,
  })),
);

/** Halaman masuk dan sejenisnya (Rancangan §6.1): desktop lajur kehadiran besar di kiri, form di kanan; mobile hanya form. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[minmax(0,1fr)_28rem]">
      <aside aria-hidden className="hidden flex-col justify-between bg-paper p-12 lg:flex">
        <Logo />
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-md bg-surface p-6">
          {ROWS.map((row, i) => (
            <AttendanceStrip key={i} days={row} size="lg" />
          ))}
          <p className="pt-2 text-caption text-ink-2">{t("auth.stripCaption")}</p>
        </div>
        <p className="max-w-[18ch] text-h1">{t("auth.tagline")}</p>
      </aside>
      <main className="flex min-h-dvh flex-col justify-center bg-surface px-6 py-10 sm:px-10 lg:min-h-0">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <Logo className="lg:hidden" />
          <h1 className="text-h1">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
