import { isValidCalendarDate } from "@hadirin/domain";
import { phoneE164Schema, type CalendarDate } from "@hadirin/shared";
import { normalizeHeader, type SheetRow } from "./spreadsheet";

export interface RowIssue {
  field: string;
  message: string;
}

export interface RowResult<T> {
  row: number;
  data: T | null;
  errors: RowIssue[];
}

export interface StudentRowData {
  nis: string;
  name: string;
  nisn: string | null;
  classId: string | null;
  className: string | null;
  startDate: CalendarDate | null;
}

export interface TeacherRowData {
  name: string;
  email: string;
  nip: string | null;
}

export interface ParentRowData {
  name: string;
  phoneWa: string;
  relation: string;
  childNis: string[];
}

/** Judul kolom yang dikenali per jenis impor. Alias menampung variasi penulisan di Excel. */
export const COLUMNS = {
  STUDENTS: {
    required: ["nis", "nama"],
    optional: ["nisn", "kelas", "tanggal_masuk"],
    aliases: { nama_lengkap: "nama", name: "nama", tgl_masuk: "tanggal_masuk" } as Record<
      string,
      string
    >,
  },
  TEACHERS: {
    required: ["nama", "email"],
    optional: ["nip"],
    aliases: { nama_lengkap: "nama", name: "nama", surel: "email" } as Record<string, string>,
  },
  PARENTS: {
    required: ["nama", "no_wa"],
    optional: ["nis_anak", "hubungan"],
    aliases: {
      nama_lengkap: "nama",
      name: "nama",
      no_hp: "no_wa",
      hp: "no_wa",
      telepon: "no_wa",
      wa: "no_wa",
      nis: "nis_anak",
    } as Record<string, string>,
  },
} as const;

export type ImportKindKey = keyof typeof COLUMNS;

/** Mengganti alias menjadi nama kolom baku dan memeriksa kolom wajib. Mengembalikan kolom yang kurang. */
export function canonicalizeRows(
  kind: ImportKindKey,
  headers: readonly string[],
  rows: readonly SheetRow[],
): { rows: SheetRow[]; missing: string[] } {
  const spec = COLUMNS[kind];
  const known = new Set<string>([...spec.required, ...spec.optional]);
  const map = (h: string) => (known.has(h) ? h : (spec.aliases[h] ?? h));
  const present = new Set(headers.map(map));
  const missing = spec.required.filter((c) => !present.has(c));
  const out = rows.map((r) => {
    const cells: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.cells)) cells[map(normalizeHeader(k))] = v;
    return { rowNumber: r.rowNumber, cells };
  });
  return { rows: out, missing };
}

/** Tanggal berformat YYYY-MM-DD, DD/MM/YYYY, atau DD-MM-YYYY menjadi YYYY-MM-DD; `null` bila tidak valid. */
export function parseDateCell(value: string): CalendarDate | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return isValidCalendarDate(v) ? v : null;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (dmy) {
    const d = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
    return isValidCalendarDate(d) ? d : null;
  }
  return null;
}

/** 0812-3456-789 -> +62812... ; 62812... -> +62812... ; +62... dipertahankan. */
export function normalizePhone(value: string): string {
  const v = value.replace(/[\s().-]/g, "");
  if (v.startsWith("+")) return v;
  if (v.startsWith("0")) return `+62${v.slice(1)}`;
  if (v.startsWith("62")) return `+${v}`;
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface StudentContext {
  /** NIS yang sudah ada di sistem. */
  existingNis: ReadonlySet<string>;
  /** Nama kelas (huruf kecil) -> id, untuk tahun ajaran aktif. */
  classesByName: ReadonlyMap<string, { id: string; name: string }>;
  hasActiveYear: boolean;
}

export function validateStudentRows(
  rows: readonly SheetRow[],
  ctx: StudentContext,
): RowResult<StudentRowData>[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const errors: RowIssue[] = [];
    const c = r.cells;
    const nis = (c.nis ?? "").trim();
    const name = (c.nama ?? "").trim();
    const nisn = (c.nisn ?? "").trim();
    const className = (c.kelas ?? "").trim();
    const startRaw = (c.tanggal_masuk ?? "").trim();

    if (!nis) errors.push({ field: "nis", message: "NIS wajib diisi." });
    else if (nis.length > 30 || !/^[A-Za-z0-9._-]+$/.test(nis))
      errors.push({
        field: "nis",
        message: "NIS hanya boleh huruf, angka, titik, garis, maksimal 30 karakter.",
      });
    else if (ctx.existingNis.has(nis))
      errors.push({ field: "nis", message: "NIS sudah terdaftar di sistem." });
    else if (seen.has(nis))
      errors.push({ field: "nis", message: `NIS ganda: sudah ada di baris ${seen.get(nis)}.` });
    else seen.set(nis, r.rowNumber);

    if (!name) errors.push({ field: "nama", message: "Nama wajib diisi." });
    else if (name.length > 150)
      errors.push({ field: "nama", message: "Nama maksimal 150 karakter." });

    if (nisn && (nisn.length > 20 || !/^\d+$/.test(nisn)))
      errors.push({ field: "nisn", message: "NISN harus berupa angka, maksimal 20 digit." });

    let classId: string | null = null;
    if (className) {
      if (!ctx.hasActiveYear)
        errors.push({
          field: "kelas",
          message: "Belum ada tahun ajaran aktif. Buat dan aktifkan tahun ajaran dulu.",
        });
      else {
        const found = ctx.classesByName.get(className.toLowerCase());
        if (!found)
          errors.push({
            field: "kelas",
            message: `Kelas ${className} tidak ditemukan di tahun ajaran aktif.`,
          });
        else classId = found.id;
      }
    }

    let startDate: CalendarDate | null = null;
    if (startRaw) {
      startDate = parseDateCell(startRaw);
      if (!startDate)
        errors.push({
          field: "tanggal_masuk",
          message: "Tanggal masuk harus berformat YYYY-MM-DD atau DD/MM/YYYY.",
        });
    }

    return {
      row: r.rowNumber,
      errors,
      data: errors.length
        ? null
        : { nis, name, nisn: nisn || null, classId, className: className || null, startDate },
    };
  });
}

export interface TeacherContext {
  existingEmails: ReadonlySet<string>;
  existingNips: ReadonlySet<string>;
}

export function validateTeacherRows(
  rows: readonly SheetRow[],
  ctx: TeacherContext,
): RowResult<TeacherRowData>[] {
  const seenEmail = new Map<string, number>();
  const seenNip = new Map<string, number>();
  return rows.map((r) => {
    const errors: RowIssue[] = [];
    const name = (r.cells.nama ?? "").trim();
    const email = (r.cells.email ?? "").trim().toLowerCase();
    const nip = (r.cells.nip ?? "").trim();

    if (!name) errors.push({ field: "nama", message: "Nama wajib diisi." });
    else if (name.length > 150)
      errors.push({ field: "nama", message: "Nama maksimal 150 karakter." });

    if (!email) errors.push({ field: "email", message: "Email wajib diisi." });
    else if (!EMAIL_RE.test(email) || email.length > 190)
      errors.push({ field: "email", message: "Format email tidak valid." });
    else if (ctx.existingEmails.has(email))
      errors.push({ field: "email", message: "Email sudah terdaftar di sistem." });
    else if (seenEmail.has(email))
      errors.push({
        field: "email",
        message: `Email ganda: sudah ada di baris ${seenEmail.get(email)}.`,
      });
    else seenEmail.set(email, r.rowNumber);

    if (nip) {
      if (nip.length > 30) errors.push({ field: "nip", message: "NIP maksimal 30 karakter." });
      else if (ctx.existingNips.has(nip))
        errors.push({ field: "nip", message: "NIP sudah terdaftar di sistem." });
      else if (seenNip.has(nip))
        errors.push({
          field: "nip",
          message: `NIP ganda: sudah ada di baris ${seenNip.get(nip)}.`,
        });
      else seenNip.set(nip, r.rowNumber);
    }

    return {
      row: r.rowNumber,
      errors,
      data: errors.length ? null : { name, email, nip: nip || null },
    };
  });
}

export interface ParentContext {
  existingPhones: ReadonlySet<string>;
  /** NIS yang ada di sekolah ini. */
  knownNis: ReadonlySet<string>;
}

export function validateParentRows(
  rows: readonly SheetRow[],
  ctx: ParentContext,
): RowResult<ParentRowData>[] {
  const seenPhone = new Map<string, number>();
  return rows.map((r) => {
    const errors: RowIssue[] = [];
    const name = (r.cells.nama ?? "").trim();
    const phoneRaw = (r.cells.no_wa ?? "").trim();
    const relation = (r.cells.hubungan ?? "").trim() || "Orang tua";
    const childNis = (r.cells.nis_anak ?? "")
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!name) errors.push({ field: "nama", message: "Nama wajib diisi." });
    else if (name.length > 150)
      errors.push({ field: "nama", message: "Nama maksimal 150 karakter." });

    const phoneWa = phoneRaw ? normalizePhone(phoneRaw) : "";
    if (!phoneRaw) errors.push({ field: "no_wa", message: "Nomor WhatsApp wajib diisi." });
    else if (!phoneE164Schema.safeParse(phoneWa).success)
      errors.push({
        field: "no_wa",
        message: "Nomor WhatsApp tidak valid. Contoh: 081234567890 atau +6281234567890.",
      });
    else if (ctx.existingPhones.has(phoneWa))
      errors.push({
        field: "no_wa",
        message: "Nomor WhatsApp sudah terdaftar pada orang tua lain.",
      });
    else if (seenPhone.has(phoneWa))
      errors.push({
        field: "no_wa",
        message: `Nomor ganda: sudah ada di baris ${seenPhone.get(phoneWa)}.`,
      });
    else seenPhone.set(phoneWa, r.rowNumber);

    if (relation.length > 30)
      errors.push({ field: "hubungan", message: "Hubungan maksimal 30 karakter." });
    for (const nis of childNis) {
      if (!ctx.knownNis.has(nis))
        errors.push({ field: "nis_anak", message: `NIS anak ${nis} tidak ditemukan.` });
    }

    return {
      row: r.rowNumber,
      errors,
      data: errors.length ? null : { name, phoneWa, relation, childNis },
    };
  });
}
