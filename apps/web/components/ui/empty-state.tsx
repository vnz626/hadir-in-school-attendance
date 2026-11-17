import type { ReactNode } from "react";
import { AttendanceStrip, type StripDay } from "../domain/attendance-strip";

// Ilustrasi keadaan kosong: lajur kehadiran yang kosong (Rancangan §4.5), bukan ilustrasi stok.
const EMPTY_DAYS: StripDay[] = Array.from({ length: 14 }, (_, i) => ({
  date: `kosong-${i}`,
  status: "none",
}));

/** Judul satu baris, penjelasan satu kalimat, satu tombol aksi (Rancangan §4.6). */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-12">
      <AttendanceStrip days={EMPTY_DAYS} className="bg-transparent" />
      <h2 className="text-h3">{title}</h2>
      <p className="max-w-[70ch] text-body text-ink-2">{description}</p>
      {action}
    </div>
  );
}
