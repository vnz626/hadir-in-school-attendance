import {
  PERCENTAGE_RULE,
  type AttendanceStatus,
  type CalendarDate,
  type PercentageRule,
} from "@hadirin/shared";

export interface StatusCounts {
  present: number;
  late: number;
  dispensed: number;
  excused: number;
  sick: number;
  absent: number;
}

export function emptyCounts(): StatusCounts {
  return { present: 0, late: 0, dispensed: 0, excused: 0, sick: 0, absent: 0 };
}

const FIELD: Record<AttendanceStatus, keyof StatusCounts> = {
  PRESENT: "present",
  LATE: "late",
  DISPENSED: "dispensed",
  EXCUSED: "excused",
  SICK: "sick",
  ABSENT: "absent",
};

/**
 * Persentase kehadiran (Rancangan §12.8). `null` bila penyebut 0: UI menampilkan "–",
 * bukan 0% atau 100%. Hasil berupa pecahan 0..1.
 */
export function attendancePercentage(counts: StatusCounts, rule: PercentageRule): number | null {
  const attended = counts.present + counts.late + counts.dispensed;
  const denominator =
    rule === PERCENTAGE_RULE.INCLUDE_EXCUSED
      ? attended + counts.excused + counts.sick + counts.absent
      : attended + counts.absent;
  if (denominator === 0) return null;
  return attended / denominator;
}

export interface StudentRecap {
  counts: StatusCounts;
  /** Hari wajib tanpa status sama sekali. Bukan alpa, tidak masuk persentase. */
  untrackedDays: CalendarDate[];
  percentage: number | null;
}

/**
 * Rekap satu siswa: setiap hari wajib dilihat statusnya di `dailyStatuses`; yang tidak ada
 * dicatat sebagai "Tidak tercatat" supaya kelalaian membuka sesi terlihat (Rancangan §12.8, §12.10).
 */
export function buildStudentRecap(
  requiredDays: readonly CalendarDate[],
  dailyStatuses: ReadonlyMap<CalendarDate, AttendanceStatus>,
  rule: PercentageRule,
): StudentRecap {
  const counts = emptyCounts();
  const untrackedDays: CalendarDate[] = [];
  for (const day of requiredDays) {
    const status = dailyStatuses.get(day);
    if (status === undefined) untrackedDays.push(day);
    else counts[FIELD[status]] += 1;
  }
  return { counts, untrackedDays, percentage: attendancePercentage(counts, rule) };
}

/** Kalimat aturan yang WAJIB tampil di halaman rekap dan PDF (Rancangan §12.8). */
export function percentageRuleSentence(rule: PercentageRule): string {
  return rule === PERCENTAGE_RULE.INCLUDE_EXCUSED
    ? "Persentase = (Hadir + Terlambat + Dispensasi) ÷ (Hadir + Terlambat + Dispensasi + Izin + Sakit + Alpa)."
    : "Persentase = (Hadir + Terlambat + Dispensasi) ÷ (Hadir + Terlambat + Dispensasi + Alpa). Izin dan sakit tidak dihitung.";
}
