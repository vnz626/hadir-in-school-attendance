import { z } from "zod";
import { ATTENDANCE_MODE, HOLIDAY_SCOPE, PERCENTAGE_RULE, STAFF_POSITION } from "./constants";
import { calendarDateSchema, minuteOfDaySchema } from "./schemas";

// Skema data master (Rancangan §10.2, §11.2). Dipakai sama oleh API (validasi) dan web (formulir).

// ---------- umum ----------

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  includeArchived: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

const idSchema = z.string().uuid("ID tidak valid");
const optionalId = idSchema.nullable().optional();

const dateOrder = <T extends { startDate: string; endDate: string }>(v: T) =>
  v.endDate >= v.startDate;
const dateOrderMessage = {
  message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
  path: ["endDate"],
};

// ---------- tahun ajaran, semester ----------

export const academicYearCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(20),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    isActive: z.boolean().default(false),
  })
  .refine(dateOrder, dateOrderMessage);
export const academicYearUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(20),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    isActive: z.boolean(),
  })
  .partial();
export interface AcademicYearDto {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export const termCreateSchema = z
  .object({
    academicYearId: idSchema,
    semester: z.union([z.literal(1), z.literal(2)]),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    isActive: z.boolean().default(false),
  })
  .refine(dateOrder, dateOrderMessage);
export const termUpdateSchema = z
  .object({
    semester: z.union([z.literal(1), z.literal(2)]),
    startDate: calendarDateSchema,
    endDate: calendarDateSchema,
    isActive: z.boolean(),
  })
  .partial();
export interface TermDto {
  id: string;
  academicYearId: string;
  semester: 1 | 2;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

// ---------- mapel, kelas ----------

export const subjectCreateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(100),
});
export const subjectUpdateSchema = subjectCreateSchema.partial();
export interface SubjectDto {
  id: string;
  code: string;
  name: string;
}

export const classCreateSchema = z.object({
  academicYearId: idSchema,
  name: z.string().trim().min(1).max(50),
  grade: z.number().int().min(1).max(12),
  homeroomTeacherId: optionalId,
});
export const classUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    grade: z.number().int().min(1).max(12),
    homeroomTeacherId: optionalId,
  })
  .partial();
export interface ClassDto {
  id: string;
  academicYearId: string;
  name: string;
  grade: number;
  homeroomTeacherId: string | null;
  homeroomTeacherName: string | null;
  studentCount: number;
  archived: boolean;
}

// ---------- siswa, pendaftaran kelas ----------

export const STUDENT_STATUS = ["ACTIVE", "GRADUATED", "MOVED", "DROPPED"] as const;

export const studentCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  nis: z.string().trim().min(1).max(30),
  nisn: z.string().trim().max(20).nullable().optional(),
  // Bila diisi, siswa langsung didaftarkan ke kelas ini mulai `enrollmentStartDate`.
  classId: idSchema.optional(),
  enrollmentStartDate: calendarDateSchema.optional(),
});
export const studentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    nis: z.string().trim().min(1).max(30),
    nisn: z.string().trim().max(20).nullable(),
    status: z.enum(STUDENT_STATUS),
  })
  .partial();
export interface StudentDto {
  id: string;
  name: string;
  nis: string;
  nisn: string | null;
  status: (typeof STUDENT_STATUS)[number];
  classId: string | null;
  className: string | null;
  mustChangePassword: boolean;
  archived: boolean;
}
export interface StudentCreatedDto {
  student: StudentDto;
  /** Ditampilkan sekali; tidak disimpan dalam bentuk teks. */
  temporaryPassword: string;
}

export const enrollmentCreateSchema = z.object({
  classId: idSchema,
  startDate: calendarDateSchema,
});
export interface EnrollmentDto {
  id: string;
  classId: string;
  className: string;
  academicYearId: string;
  startDate: string;
  endDate: string | null;
  endReason: string | null;
}

// ---------- guru, jabatan ----------

export const teacherCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(190),
  nip: z.string().trim().max(30).nullable().optional(),
});
export const teacherUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().max(190),
    nip: z.string().trim().max(30).nullable(),
    isActive: z.boolean(),
  })
  .partial();
export interface TeacherDto {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  nip: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  archived: boolean;
}
export interface TeacherCreatedDto {
  teacher: TeacherDto;
  temporaryPassword: string;
}

const positionEnum = z.enum([
  STAFF_POSITION.PICKET,
  STAFF_POSITION.COUNSELOR,
  STAFF_POSITION.PRINCIPAL,
]);
export const staffPositionCreateSchema = z
  .object({
    teacherId: idSchema,
    position: positionEnum,
    academicYearId: idSchema,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema.nullable().optional(),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, {
    message: "Tanggal berakhir tidak boleh sebelum tanggal mulai.",
    path: ["endsOn"],
  });
export const staffPositionUpdateSchema = z
  .object({
    position: positionEnum,
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema.nullable(),
  })
  .partial();
export interface StaffPositionDto {
  id: string;
  teacherId: string;
  teacherName: string;
  position: keyof typeof STAFF_POSITION;
  academicYearId: string;
  startsOn: string;
  endsOn: string | null;
}

// ---------- orang tua ----------

/** Format E.164 (Rancangan §10.2). */
export const phoneE164Schema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Nomor harus berformat internasional, contoh +6281234567890.");

export const parentCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  phoneWa: phoneE164Schema,
  waOptIn: z.boolean().default(false),
});
export const parentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    phoneWa: phoneE164Schema,
    waOptIn: z.boolean(),
  })
  .partial();
export interface ParentDto {
  id: string;
  userId: string;
  name: string;
  phoneWa: string;
  waOptIn: boolean;
  childCount: number;
}

export const studentParentCreateSchema = z.object({
  studentId: idSchema,
  parentId: idSchema,
  relation: z.string().trim().min(1).max(30),
  isPrimary: z.boolean().default(false),
  receivesNotifications: z.boolean().default(true),
});
export const studentParentUpdateSchema = z
  .object({
    relation: z.string().trim().min(1).max(30),
    isPrimary: z.boolean(),
    receivesNotifications: z.boolean(),
  })
  .partial();
export interface StudentParentDto {
  id: string;
  studentId: string;
  studentName: string;
  parentId: string;
  parentName: string;
  relation: string;
  isPrimary: boolean;
  receivesNotifications: boolean;
}

// ---------- jadwal, libur, geofence ----------

const dayOfWeek = z.number().int().min(1).max(7);

export const scheduleCreateSchema = z
  .object({
    termId: idSchema,
    classId: idSchema,
    subjectId: idSchema,
    teacherId: idSchema,
    dayOfWeek,
    startTime: minuteOfDaySchema,
    endTime: minuteOfDaySchema,
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "Jam selesai harus setelah jam mulai.",
    path: ["endTime"],
  });
export const scheduleUpdateSchema = z
  .object({
    subjectId: idSchema,
    teacherId: idSchema,
    dayOfWeek,
    startTime: minuteOfDaySchema,
    endTime: minuteOfDaySchema,
  })
  .partial();
export interface ScheduleDto {
  id: string;
  termId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  dayOfWeek: number;
  startTime: number;
  endTime: number;
}

export const holidayCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    dateFrom: calendarDateSchema,
    dateTo: calendarDateSchema,
    scope: z.enum([HOLIDAY_SCOPE.ALL, HOLIDAY_SCOPE.GRADE, HOLIDAY_SCOPE.CLASS]),
    grade: z.number().int().min(1).max(12).nullable().optional(),
    classId: idSchema.nullable().optional(),
  })
  .refine((v) => v.dateTo >= v.dateFrom, {
    message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    path: ["dateTo"],
  })
  .refine((v) => (v.scope === HOLIDAY_SCOPE.GRADE) === (v.grade != null), {
    message: "Tingkat wajib diisi untuk libur per tingkat, dan hanya untuk itu.",
    path: ["grade"],
  })
  .refine((v) => (v.scope === HOLIDAY_SCOPE.CLASS) === (v.classId != null), {
    message: "Kelas wajib diisi untuk libur per kelas, dan hanya untuk itu.",
    path: ["classId"],
  });
export const holidayUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  dateFrom: calendarDateSchema.optional(),
  dateTo: calendarDateSchema.optional(),
});
export interface HolidayDto {
  id: string;
  name: string;
  dateFrom: string;
  dateTo: string;
  scope: keyof typeof HOLIDAY_SCOPE;
  grade: number | null;
  classId: string | null;
  className: string | null;
}

export const geofenceCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(1).max(5000),
  isActive: z.boolean().default(true),
});
export const geofenceUpdateSchema = geofenceCreateSchema.partial();
export interface GeofenceDto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  isActive: boolean;
}

// ---------- pengaturan sekolah ----------

export const schoolProfileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  npsn: z.string().trim().max(20).nullable(),
  address: z.string().trim().max(500).nullable(),
  timezone: z.string().trim().min(1).max(64),
});
export type SchoolProfile = z.infer<typeof schoolProfileSchema>;

const CHECKIN_MODES = ["QR", "QUICK"] as const;

export const schoolSettingsSchema = z
  .object({
    checkinModes: z.array(z.enum(CHECKIN_MODES)).min(1, "Pilih minimal satu cara absen.").max(2),
    attendanceMode: z.enum([
      ATTENDANCE_MODE.DAILY_ONLY,
      ATTENDANCE_MODE.SUBJECT_ONLY,
      ATTENDANCE_MODE.BOTH,
    ]),
    schoolDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Pilih minimal satu hari sekolah.")
      .max(7),
    dailyStartTime: minuteOfDaySchema,
    dailyCloseTime: minuteOfDaySchema,
    defaultLateAfterMinutes: z.number().int().min(0).max(240),
    lateAfterOpenGraceMinutes: z.number().int().min(0).max(120),
    adhocSessionMinutes: z.number().int().min(1).max(240),
    geofenceEnabled: z.boolean(),
    locationAccuracyMaxM: z.number().int().min(1).max(5000),
    deviceBindingEnabled: z.boolean(),
    deviceSelfRebindDays: z.number().int().min(0).max(365),
    percentageRule: z.enum([PERCENTAGE_RULE.EXCLUDE_EXCUSED, PERCENTAGE_RULE.INCLUDE_EXCUSED]),
    notifyQuietStart: minuteOfDaySchema,
    notifyQuietEnd: minuteOfDaySchema,
    subjectDigestTime: minuteOfDaySchema,
    backfillDays: z.number().int().min(0).max(60),
    retentionYears: z.number().int().min(0).max(20),
  })
  .refine((v) => new Set(v.schoolDays).size === v.schoolDays.length, {
    message: "Hari sekolah tidak boleh ganda.",
    path: ["schoolDays"],
  })
  .refine((v) => v.dailyCloseTime > v.dailyStartTime, {
    message: "Batas tutup sesi harian harus setelah jam masuk.",
    path: ["dailyCloseTime"],
  });
export type SchoolSettings = z.infer<typeof schoolSettingsSchema>;

export const settingsUpdateSchema = z.object({
  school: schoolProfileSchema.partial().optional(),
  // Pembaruan parsial: validasi lintas-bidang dijalankan server terhadap gabungan dengan nilai tersimpan.
  settings: z
    .object({
      checkinModes: z.array(z.enum(CHECKIN_MODES)),
      attendanceMode: z.enum([
        ATTENDANCE_MODE.DAILY_ONLY,
        ATTENDANCE_MODE.SUBJECT_ONLY,
        ATTENDANCE_MODE.BOTH,
      ]),
      schoolDays: z.array(z.number().int().min(1).max(7)),
      dailyStartTime: minuteOfDaySchema,
      dailyCloseTime: minuteOfDaySchema,
      defaultLateAfterMinutes: z.number().int().min(0).max(240),
      lateAfterOpenGraceMinutes: z.number().int().min(0).max(120),
      adhocSessionMinutes: z.number().int().min(1).max(240),
      geofenceEnabled: z.boolean(),
      locationAccuracyMaxM: z.number().int().min(1).max(5000),
      deviceBindingEnabled: z.boolean(),
      deviceSelfRebindDays: z.number().int().min(0).max(365),
      percentageRule: z.enum([PERCENTAGE_RULE.EXCLUDE_EXCUSED, PERCENTAGE_RULE.INCLUDE_EXCUSED]),
      notifyQuietStart: minuteOfDaySchema,
      notifyQuietEnd: minuteOfDaySchema,
      subjectDigestTime: minuteOfDaySchema,
      backfillDays: z.number().int().min(0).max(60),
      retentionYears: z.number().int().min(0).max(20),
    })
    .partial()
    .optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export interface SettingsDto {
  school: SchoolProfile;
  settings: SchoolSettings;
  /** Pembaca baca-saja (BK, kepala sekolah) tidak bisa menyimpan. */
  readOnly: boolean;
}
