import { DAY_NAMES, formatDate, minutesToTime } from "./format";
import { t, td } from "./i18n";

// Konfigurasi data master (Rancangan §11.2, §6.7). Satu pola layar dipakai ulang untuk semua sumber
// data. Validasi sebenarnya ada di server (skema Zod bersama); web hanya menampilkan galat per kolom.

export type Row = { id: string } & Record<string, unknown>;

export type FieldKind = "text" | "number" | "date" | "time" | "checkbox" | "select" | "ref";

export interface Option {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  kind: FieldKind;
  required?: boolean;
  /** Hanya saat membuat (tidak bisa diubah sesudahnya). */
  createOnly?: boolean;
  /** Hanya saat mengubah. */
  editOnly?: boolean;
  /** Kosong dikirim sebagai `null` (menghapus nilai), bukan dilewati. */
  nullable?: boolean;
  /** Pilihan `select`; `numeric` mengirim angka, bukan teks. */
  options?: Option[];
  numeric?: boolean;
  ref?: RefKey;
  /** Label awal pemilih rujukan saat mengubah, diambil dari baris. */
  initialLabel?: (row: Row) => string | null;
  /** Tampil hanya bila syarat terpenuhi (mis. tingkat untuk libur per tingkat). */
  showWhen?: (values: Record<string, string | boolean>) => boolean;
  step?: string;
  maxLength?: number;
}

export interface ColumnDef {
  key: string;
  header: string;
  cell: (row: Row) => string;
  numeric?: boolean;
  sortKey?: string;
}

export type RowAction = "resetPassword" | "moveClass" | "credentialCards";

export interface ResourceDef {
  key: string;
  path: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  /** DELETE mengarsipkan (data tetap ada) atau menghapus. */
  removal: "archive" | "delete";
  actions?: RowAction[];
  /** Respons pembuatan memuat kata sandi sementara satu kali. */
  temporaryPassword?: { wrapper: "student" | "teacher"; nameField: string };
  defaultSort: string;
  filters?: Array<"academicYear">;
}

export type RefKey =
  "academic-years" | "terms" | "classes" | "teachers" | "students" | "parents" | "subjects";

export const REF_SOURCES: Record<RefKey, { path: string; label: (row: Row) => string }> = {
  "academic-years": { path: "/academic-years", label: (r) => String(r.name) },
  terms: {
    path: "/terms",
    label: (r) =>
      `${td(`options.semester${r.semester}`)} (${formatDate(String(r.startDate))} - ${formatDate(String(r.endDate))})`,
  },
  classes: { path: "/classes", label: (r) => String(r.name) },
  teachers: { path: "/teachers", label: (r) => `${r.name}${r.email ? ` (${r.email})` : ""}` },
  students: { path: "/students", label: (r) => `${r.name} (${r.nis})` },
  parents: { path: "/parents", label: (r) => `${r.name} (${r.phoneWa})` },
  subjects: { path: "/subjects", label: (r) => `${r.name} (${r.code})` },
};

const yn = (v: unknown) => (v ? t("common.yes") : t("common.no"));
const text = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : String(v));
const dateOf = (v: unknown) => (typeof v === "string" && v ? formatDate(v) : "-");
const label = (resource: string, field: string) => td(`resources.${resource}.fields.${field}`);

const opts = (prefix: string, values: string[]): Option[] =>
  values.map((v) => ({ value: v, label: td(`options.${prefix}${v}`) }));

const DAYS: Option[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  value: String(d),
  label: DAY_NAMES[d]!,
}));

const col = (
  resource: string,
  key: string,
  cell: ColumnDef["cell"],
  more: Partial<ColumnDef> = {},
): ColumnDef => ({
  key,
  header: label(resource, key),
  cell,
  ...more,
});

/** Dibangun saat dipakai agar teks mengikuti berkas terjemahan. */
export function buildResources(): Record<string, ResourceDef> {
  const defs: ResourceDef[] = [
    {
      key: "academic-years",
      path: "/academic-years",
      removal: "delete",
      defaultSort: "startDate",
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 20 },
        { name: "startDate", kind: "date", required: true },
        { name: "endDate", kind: "date", required: true },
        { name: "isActive", kind: "checkbox" },
      ],
      columns: [
        col("academic-years", "name", (r) => text(r.name), { sortKey: "name" }),
        col("academic-years", "startDate", (r) => dateOf(r.startDate), { sortKey: "startDate" }),
        col("academic-years", "endDate", (r) => dateOf(r.endDate)),
        col("academic-years", "isActive", (r) => yn(r.isActive)),
      ],
    },
    {
      key: "terms",
      path: "/terms",
      removal: "delete",
      defaultSort: "startDate",
      fields: [
        {
          name: "academicYearId",
          kind: "ref",
          ref: "academic-years",
          required: true,
          createOnly: true,
        },
        {
          name: "semester",
          kind: "select",
          numeric: true,
          required: true,
          options: [
            { value: "1", label: t("options.semester1") },
            { value: "2", label: t("options.semester2") },
          ],
        },
        { name: "startDate", kind: "date", required: true },
        { name: "endDate", kind: "date", required: true },
        { name: "isActive", kind: "checkbox" },
      ],
      columns: [
        col("terms", "semester", (r) => td(`options.semester${r.semester}`), {
          sortKey: "semester",
        }),
        col("terms", "startDate", (r) => dateOf(r.startDate), { sortKey: "startDate" }),
        col("terms", "endDate", (r) => dateOf(r.endDate)),
        col("terms", "isActive", (r) => yn(r.isActive)),
      ],
    },
    {
      key: "subjects",
      path: "/subjects",
      removal: "delete",
      defaultSort: "name",
      fields: [
        { name: "code", kind: "text", required: true, maxLength: 20 },
        { name: "name", kind: "text", required: true, maxLength: 100 },
      ],
      columns: [
        col("subjects", "code", (r) => text(r.code), { sortKey: "code" }),
        col("subjects", "name", (r) => text(r.name), { sortKey: "name" }),
      ],
    },
    {
      key: "classes",
      path: "/classes",
      removal: "archive",
      defaultSort: "name",
      actions: ["credentialCards"],
      fields: [
        {
          name: "academicYearId",
          kind: "ref",
          ref: "academic-years",
          required: true,
          createOnly: true,
        },
        { name: "name", kind: "text", required: true, maxLength: 50 },
        { name: "grade", kind: "number", required: true },
        {
          name: "homeroomTeacherId",
          kind: "ref",
          ref: "teachers",
          nullable: true,
          initialLabel: (r) => (r.homeroomTeacherName ? String(r.homeroomTeacherName) : null),
        },
      ],
      columns: [
        col("classes", "name", (r) => text(r.name), { sortKey: "name" }),
        col("classes", "grade", (r) => text(r.grade), { numeric: true, sortKey: "grade" }),
        col("classes", "homeroomTeacherName", (r) => text(r.homeroomTeacherName)),
        col("classes", "studentCount", (r) => text(r.studentCount), { numeric: true }),
      ],
    },
    {
      key: "students",
      path: "/students",
      removal: "archive",
      defaultSort: "name",
      actions: ["resetPassword", "moveClass"],
      temporaryPassword: { wrapper: "student", nameField: "name" },
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 150 },
        { name: "nis", kind: "text", required: true, maxLength: 30 },
        { name: "nisn", kind: "text", nullable: true, maxLength: 20 },
        { name: "classId", kind: "ref", ref: "classes", createOnly: true },
        { name: "enrollmentStartDate", kind: "date", createOnly: true },
        {
          name: "status",
          kind: "select",
          editOnly: true,
          options: opts("student", ["ACTIVE", "GRADUATED", "MOVED", "DROPPED"]),
        },
      ],
      columns: [
        col("students", "name", (r) => text(r.name), { sortKey: "name" }),
        col("students", "nis", (r) => text(r.nis), { sortKey: "nis" }),
        col("students", "className", (r) => text(r.className)),
        col("students", "status", (r) => td(`options.student${r.status}`), { sortKey: "status" }),
      ],
    },
    {
      key: "teachers",
      path: "/teachers",
      removal: "archive",
      defaultSort: "name",
      temporaryPassword: { wrapper: "teacher", nameField: "name" },
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 150 },
        { name: "email", kind: "text", required: true, maxLength: 190 },
        { name: "nip", kind: "text", nullable: true, maxLength: 30 },
        { name: "isActive", kind: "checkbox", editOnly: true },
      ],
      columns: [
        col("teachers", "name", (r) => text(r.name), { sortKey: "name" }),
        col("teachers", "email", (r) => text(r.email), { sortKey: "email" }),
        col("teachers", "nip", (r) => text(r.nip)),
        col("teachers", "isActive", (r) => yn(r.isActive)),
      ],
    },
    {
      key: "staff-positions",
      path: "/staff-positions",
      removal: "delete",
      defaultSort: "startsOn",
      fields: [
        { name: "teacherId", kind: "ref", ref: "teachers", required: true, createOnly: true },
        {
          name: "position",
          kind: "select",
          required: true,
          options: opts("position", ["PICKET", "COUNSELOR", "PRINCIPAL"]),
        },
        {
          name: "academicYearId",
          kind: "ref",
          ref: "academic-years",
          required: true,
          createOnly: true,
        },
        { name: "startsOn", kind: "date", required: true },
        { name: "endsOn", kind: "date", nullable: true },
      ],
      columns: [
        col("staff-positions", "teacherName", (r) => text(r.teacherName)),
        col("staff-positions", "position", (r) => td(`options.position${r.position}`)),
        col("staff-positions", "startsOn", (r) => dateOf(r.startsOn)),
        col("staff-positions", "endsOn", (r) => dateOf(r.endsOn)),
      ],
    },
    {
      key: "parents",
      path: "/parents",
      removal: "archive",
      defaultSort: "name",
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 150 },
        { name: "phoneWa", kind: "text", required: true, maxLength: 16 },
        { name: "waOptIn", kind: "checkbox" },
      ],
      columns: [
        col("parents", "name", (r) => text(r.name), { sortKey: "name" }),
        col("parents", "phoneWa", (r) => text(r.phoneWa), { sortKey: "phoneWa" }),
        col("parents", "waOptIn", (r) => yn(r.waOptIn)),
        col("parents", "childCount", (r) => text(r.childCount), { numeric: true }),
      ],
    },
    {
      key: "student-parents",
      path: "/student-parents",
      removal: "delete",
      defaultSort: "createdAt",
      fields: [
        { name: "studentId", kind: "ref", ref: "students", required: true, createOnly: true },
        { name: "parentId", kind: "ref", ref: "parents", required: true, createOnly: true },
        { name: "relation", kind: "text", required: true, maxLength: 30 },
        { name: "isPrimary", kind: "checkbox" },
        { name: "receivesNotifications", kind: "checkbox" },
      ],
      columns: [
        col("student-parents", "studentName", (r) => text(r.studentName)),
        col("student-parents", "parentName", (r) => text(r.parentName)),
        col("student-parents", "relation", (r) => text(r.relation)),
        col("student-parents", "isPrimary", (r) => yn(r.isPrimary)),
      ],
    },
    {
      key: "schedules",
      path: "/schedules",
      removal: "delete",
      defaultSort: "dayOfWeek",
      fields: [
        { name: "termId", kind: "ref", ref: "terms", required: true, createOnly: true },
        { name: "classId", kind: "ref", ref: "classes", required: true, createOnly: true },
        {
          name: "subjectId",
          kind: "ref",
          ref: "subjects",
          required: true,
          initialLabel: (r) => (r.subjectName ? String(r.subjectName) : null),
        },
        {
          name: "teacherId",
          kind: "ref",
          ref: "teachers",
          required: true,
          initialLabel: (r) => (r.teacherName ? String(r.teacherName) : null),
        },
        { name: "dayOfWeek", kind: "select", numeric: true, required: true, options: DAYS },
        { name: "startTime", kind: "time", required: true },
        { name: "endTime", kind: "time", required: true },
      ],
      columns: [
        col("schedules", "dayOfWeek", (r) => DAY_NAMES[Number(r.dayOfWeek)] ?? "-", {
          sortKey: "dayOfWeek",
        }),
        col(
          "schedules",
          "time",
          (r) => `${minutesToTime(Number(r.startTime))} - ${minutesToTime(Number(r.endTime))}`,
          { sortKey: "startTime" },
        ),
        col("schedules", "className", (r) => text(r.className)),
        col("schedules", "subjectName", (r) => text(r.subjectName)),
        col("schedules", "teacherName", (r) => text(r.teacherName)),
      ],
    },
    {
      key: "holidays",
      path: "/holidays",
      removal: "delete",
      defaultSort: "dateFrom",
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 150 },
        { name: "dateFrom", kind: "date", required: true },
        { name: "dateTo", kind: "date", required: true },
        {
          name: "scope",
          kind: "select",
          required: true,
          createOnly: true,
          options: opts("scope", ["ALL", "GRADE", "CLASS"]),
        },
        { name: "grade", kind: "number", createOnly: true, showWhen: (v) => v.scope === "GRADE" },
        {
          name: "classId",
          kind: "ref",
          ref: "classes",
          createOnly: true,
          showWhen: (v) => v.scope === "CLASS",
        },
      ],
      columns: [
        col("holidays", "name", (r) => text(r.name), { sortKey: "name" }),
        col("holidays", "dateFrom", (r) => dateOf(r.dateFrom), { sortKey: "dateFrom" }),
        col("holidays", "dateTo", (r) => dateOf(r.dateTo)),
        col("holidays", "scope", (r) => td(`options.scope${r.scope}`)),
        col("holidays", "className", (r) => text(r.className)),
      ],
    },
    {
      key: "geofences",
      path: "/geofences",
      removal: "delete",
      defaultSort: "name",
      fields: [
        { name: "name", kind: "text", required: true, maxLength: 100 },
        { name: "lat", kind: "number", required: true, step: "any" },
        { name: "lng", kind: "number", required: true, step: "any" },
        { name: "radiusM", kind: "number", required: true },
        { name: "isActive", kind: "checkbox" },
      ],
      columns: [
        col("geofences", "name", (r) => text(r.name), { sortKey: "name" }),
        col("geofences", "lat", (r) => text(r.lat), { numeric: true }),
        col("geofences", "lng", (r) => text(r.lng), { numeric: true }),
        col("geofences", "radiusM", (r) => text(r.radiusM), { numeric: true, sortKey: "radiusM" }),
        col("geofences", "isActive", (r) => yn(r.isActive)),
      ],
    },
  ];
  return Object.fromEntries(defs.map((d) => [d.key, d]));
}

/** Urutan penyiapan sekolah yang disarankan (dipakai halaman indeks data master). */
export const RESOURCE_ORDER = [
  "academic-years",
  "terms",
  "subjects",
  "teachers",
  "classes",
  "staff-positions",
  "students",
  "parents",
  "student-parents",
  "schedules",
  "holidays",
  "geofences",
] as const;
