import {
  ATTENDANCE_MODE,
  ATTENDANCE_STATUS,
  DAILY_STATUS_SOURCE,
  SESSION_TYPE,
  type AttendanceMode,
  type AttendanceStatus,
  type DailyStatusSource,
  type SessionType,
} from "@hadirin/shared";

/** Satu baris kehadiran dari sesi `CLOSED` pada hari itu. Pemanggil yang menyaring sesi. */
export interface ClosedSessionRow {
  sessionType: SessionType;
  sessionStartsAt: Date;
  status: AttendanceStatus;
}

export interface DailyStatusResult {
  status: AttendanceStatus;
  source: DailyStatusSource;
  partialAbsence: boolean;
}

// Urutan tie-break Rancangan §12.9: S, lalu I, lalu D.
const EXCUSE_TIE_ORDER: readonly AttendanceStatus[] = [
  ATTENDANCE_STATUS.SICK,
  ATTENDANCE_STATUS.EXCUSED,
  ATTENDANCE_STATUS.DISPENSED,
];

const isAttended = (s: AttendanceStatus) =>
  s === ATTENDANCE_STATUS.PRESENT || s === ATTENDANCE_STATUS.LATE;

/**
 * Status harian turunan (Rancangan §12.9). `null` = tidak ada sesi yang relevan, yaitu hari
 * "Tidak tercatat" (bukan alpa).
 */
export function deriveDailyStatus(
  mode: AttendanceMode,
  rows: readonly ClosedSessionRow[],
): DailyStatusResult | null {
  const daily = rows.filter((r) => r.sessionType === SESSION_TYPE.DAILY);
  const subject = rows.filter((r) => r.sessionType === SESSION_TYPE.SUBJECT);

  if (mode === ATTENDANCE_MODE.DAILY_ONLY || mode === ATTENDANCE_MODE.BOTH) {
    const base = daily[0];
    if (!base) return null;
    const partial =
      mode === ATTENDANCE_MODE.BOTH &&
      isAttended(base.status) &&
      subject.some((r) => r.status === ATTENDANCE_STATUS.ABSENT);
    return {
      status: base.status,
      source: DAILY_STATUS_SOURCE.DAILY_SESSION,
      partialAbsence: partial,
    };
  }

  if (subject.length === 0) return null;
  const ordered = [...subject].sort(
    (a, b) => a.sessionStartsAt.getTime() - b.sessionStartsAt.getTime(),
  );

  const firstAttended = ordered.findIndex((r) => isAttended(r.status));
  if (firstAttended >= 0) {
    const first = ordered[firstAttended]!;
    const absentAfter = ordered
      .slice(firstAttended + 1)
      .some((r) => r.status === ATTENDANCE_STATUS.ABSENT);
    return {
      status: first.status,
      source: DAILY_STATUS_SOURCE.DERIVED,
      partialAbsence: absentAfter,
    };
  }

  if (ordered.every((r) => r.status === ATTENDANCE_STATUS.ABSENT)) {
    return {
      status: ATTENDANCE_STATUS.ABSENT,
      source: DAILY_STATUS_SOURCE.DERIVED,
      partialAbsence: false,
    };
  }

  // Tidak ada yang hadir, campuran ABSENT dan I/S/D: dokumen belum menentukan. Default
  // (docs/open-questions.md): status berizin terbanyak, ditandai sebagian.
  let best: AttendanceStatus = EXCUSE_TIE_ORDER[0]!;
  let bestCount = -1;
  for (const s of EXCUSE_TIE_ORDER) {
    const c = ordered.filter((r) => r.status === s).length;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  const hasAbsent = ordered.some((r) => r.status === ATTENDANCE_STATUS.ABSENT);
  return { status: best, source: DAILY_STATUS_SOURCE.DERIVED, partialAbsence: hasAbsent };
}
