import {
  SESSION_STATUS,
  SESSION_TYPE,
  type SessionStatus,
  type SessionType,
} from "@hadirin/shared";

// Kolom kunci pengganti index parsial (Rancangan §10.3). Setiap kolom diisi HANYA lewat fungsi di
// sini, supaya rumusnya satu dan selalu cocok dengan CHECK di migrasi. Bila rumus diubah,
// ubah juga CHECK-nya lewat migrasi baru + ADR.

/** Satu sesi per jadwal per tanggal. `sessionDate` berbentuk YYYY-MM-DD. */
export function scheduleSlotKey(s: {
  scheduleId: string | null;
  sessionDate: string;
  status: SessionStatus;
}): string | null {
  return s.scheduleId !== null && s.status !== SESSION_STATUS.CANCELLED
    ? `${s.scheduleId}|${s.sessionDate}`
    : null;
}

/** Satu sesi DAILY per kelas per tanggal. */
export function dailySlotKey(s: {
  type: SessionType;
  classId: string;
  sessionDate: string;
  status: SessionStatus;
}): string | null {
  return s.type === SESSION_TYPE.DAILY && s.status !== SESSION_STATUS.CANCELLED
    ? `${s.classId}|${s.sessionDate}`
    : null;
}

/** Satu perangkat ACTIVE per siswa. */
export function activeStudentKey(d: {
  studentId: string;
  status: "ACTIVE" | "PENDING" | "REVOKED";
}): string | null {
  return d.status === "ACTIVE" ? d.studentId : null;
}

/** Satu pendaftaran terbuka per siswa per tahun ajaran. `endDate` null = masih terbuka. */
export function openEnrollmentKey(e: {
  studentId: string;
  academicYearId: string;
  endDate: string | null;
}): string | null {
  return e.endDate === null ? `${e.studentId}|${e.academicYearId}` : null;
}
