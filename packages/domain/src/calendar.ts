import { HOLIDAY_SCOPE, type CalendarDate, type HolidayScope } from "@hadirin/shared";
import { compareDates, eachDate, isoDayOfWeek } from "./dates";

export interface HolidayInput {
  dateFrom: CalendarDate;
  dateTo: CalendarDate;
  scope: HolidayScope;
  grade?: number | null;
  classId?: string | null;
}

export interface ClassRef {
  id: string;
  grade: number;
}

/** Apakah libur ini berlaku untuk kelas itu pada tanggal tersebut (Rancangan §12.8). */
export function holidayApplies(h: HolidayInput, date: CalendarDate, cls: ClassRef): boolean {
  if (compareDates(date, h.dateFrom) < 0 || compareDates(date, h.dateTo) > 0) return false;
  switch (h.scope) {
    case HOLIDAY_SCOPE.ALL:
      return true;
    case HOLIDAY_SCOPE.GRADE:
      return h.grade === cls.grade;
    case HOLIDAY_SCOPE.CLASS:
      return h.classId === cls.id;
  }
}

/**
 * Hari sekolah sebuah kelas pada rentang: hari-minggunya termasuk `schoolWeekdays` (1..7)
 * dan tidak tercakup libur yang berlaku.
 */
export function listSchoolDays(
  from: CalendarDate,
  to: CalendarDate,
  opts: { schoolWeekdays: readonly number[]; holidays: readonly HolidayInput[]; cls: ClassRef },
): CalendarDate[] {
  return eachDate(from, to).filter(
    (date) =>
      opts.schoolWeekdays.includes(isoDayOfWeek(date)) &&
      !opts.holidays.some((h) => holidayApplies(h, date, opts.cls)),
  );
}

export interface EnrollmentRange {
  startDate: CalendarDate;
  /** `null` = pendaftaran masih terbuka. */
  endDate: CalendarDate | null;
}

/**
 * Hari wajib siswa = hari sekolah yang jatuh dalam rentang pendaftaran di kelas itu.
 * Hari sebelum masuk atau setelah pindah tidak dihitung.
 */
export function requiredDays(
  schoolDays: readonly CalendarDate[],
  enrollments: readonly EnrollmentRange[],
): CalendarDate[] {
  return schoolDays.filter((day) =>
    enrollments.some(
      (e) =>
        compareDates(day, e.startDate) >= 0 &&
        (e.endDate === null || compareDates(day, e.endDate) <= 0),
    ),
  );
}
