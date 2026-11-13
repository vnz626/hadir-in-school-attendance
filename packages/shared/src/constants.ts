// Konstanta tunggal untuk FE dan BE (AGENTS.md §6). Jangan menulis literal string di tempat lain.

export const ATTENDANCE_STATUS = {
  PRESENT: "PRESENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
  SICK: "SICK",
  DISPENSED: "DISPENSED",
  ABSENT: "ABSENT",
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_METHOD = {
  QR: "QR",
  CODE: "CODE",
  MANUAL: "MANUAL",
  LEAVE: "LEAVE",
  AUTO: "AUTO",
} as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHOD)[keyof typeof ATTENDANCE_METHOD];

export const USER_ROLE = {
  ADMIN: "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT: "PARENT",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const STAFF_POSITION = {
  PICKET: "PICKET",
  COUNSELOR: "COUNSELOR",
  PRINCIPAL: "PRINCIPAL",
} as const;
export type StaffPosition = (typeof STAFF_POSITION)[keyof typeof STAFF_POSITION];

export const SESSION_TYPE = { DAILY: "DAILY", SUBJECT: "SUBJECT" } as const;
export type SessionType = (typeof SESSION_TYPE)[keyof typeof SESSION_TYPE];

export const SESSION_STATUS = { OPEN: "OPEN", CLOSED: "CLOSED", CANCELLED: "CANCELLED" } as const;
export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export const ATTENDANCE_MODE = {
  DAILY_ONLY: "DAILY_ONLY",
  SUBJECT_ONLY: "SUBJECT_ONLY",
  BOTH: "BOTH",
} as const;
export type AttendanceMode = (typeof ATTENDANCE_MODE)[keyof typeof ATTENDANCE_MODE];

export const PERCENTAGE_RULE = {
  EXCLUDE_EXCUSED: "EXCLUDE_EXCUSED",
  INCLUDE_EXCUSED: "INCLUDE_EXCUSED",
} as const;
export type PercentageRule = (typeof PERCENTAGE_RULE)[keyof typeof PERCENTAGE_RULE];

export const HOLIDAY_SCOPE = { ALL: "ALL", GRADE: "GRADE", CLASS: "CLASS" } as const;
export type HolidayScope = (typeof HOLIDAY_SCOPE)[keyof typeof HOLIDAY_SCOPE];

export const DAILY_STATUS_SOURCE = {
  DAILY_SESSION: "DAILY_SESSION",
  DERIVED: "DERIVED",
} as const;
export type DailyStatusSource = (typeof DAILY_STATUS_SOURCE)[keyof typeof DAILY_STATUS_SOURCE];

/** Tanggal kalender sekolah, format `YYYY-MM-DD`. Bukan titik waktu. */
export type CalendarDate = string;
