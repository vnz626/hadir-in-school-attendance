import type { CalendarDate } from "@hadirin/shared";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parts(date: CalendarDate): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Tanggal tidak valid: ${date}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new Error(`Tanggal tidak valid: ${date}`);
  }
  return [y, mo, d];
}

function toUtcMs(date: CalendarDate): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): CalendarDate {
  const d = new Date(ms);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidCalendarDate(date: string): boolean {
  try {
    parts(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Hari dalam minggu ISO: 1 = Senin ... 7 = Minggu (sama dengan `day_of_week` di jadwal). */
export function isoDayOfWeek(date: CalendarDate): number {
  const dow = new Date(toUtcMs(date)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Semua tanggal dari `from` sampai `to`, keduanya termasuk. Kosong bila `to < from`. */
export function eachDate(from: CalendarDate, to: CalendarDate): CalendarDate[] {
  const out: CalendarDate[] = [];
  const end = toUtcMs(to);
  for (let ms = toUtcMs(from); ms <= end; ms += MS_PER_DAY) out.push(fromUtcMs(ms));
  return out;
}

/** Tanggal berbentuk YYYY-MM-DD bisa dibandingkan secara leksikografis. */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Kolom `DATE` dibaca/ditulis Prisma sebagai `Date` pada 00:00 UTC. Tanggal kalender sekolah
 * bukan titik waktu, jadi konversinya selalu lewat dua fungsi ini, tidak lewat zona waktu.
 */
export function calendarDateToDb(date: CalendarDate): Date {
  return new Date(toUtcMs(date));
}

export function dbDateToCalendarDate(value: Date): CalendarDate {
  return fromUtcMs(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
