import type { CalendarDate } from "@hadirin/shared";
import { addDays } from "./dates";

// Konversi zona HANYA di aplikasi (Rancangan §12.11): MariaDB XAMPP tidak punya tabel zona waktu.
// Intl dipakai karena Node membawa ICU lengkap, jadi nama zona IANA selalu tersedia.

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

function partsMap(instant: Date, timeZone: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) map[p.type] = p.value;
  return map;
}

/** Tanggal kalender sekolah dari sebuah titik waktu UTC (dasar `session_date`). */
export function schoolDateOf(instant: Date, timeZone: string): CalendarDate {
  const m = partsMap(instant, timeZone);
  return `${m.year}-${m.month}-${m.day}`;
}

/** Menit sejak 00:00 waktu sekolah pada titik waktu itu. */
export function schoolMinuteOfDay(instant: Date, timeZone: string): number {
  const m = partsMap(instant, timeZone);
  return Number(m.hour) * 60 + Number(m.minute);
}

/** Selisih zona terhadap UTC (menit, positif di timur UTC) pada titik waktu tertentu. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const m = partsMap(instant, timeZone);
  const asUtc = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    Number(m.hour),
    Number(m.minute),
    Number(m.second),
  );
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60_000);
}

/**
 * Jam dinding sekolah (menit sejak 00:00) pada tanggal tertentu menjadi titik waktu UTC.
 * Dipakai untuk `starts_at` dan `late_threshold_at` dari jam jadwal (Rancangan §12.4).
 */
export function instantFromWallMinutes(
  date: CalendarDate,
  minuteOfDay: number,
  timeZone: string,
): Date {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > 1439) {
    throw new Error(`Menit jam dinding di luar 0..1439: ${minuteOfDay}`);
  }
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, mo - 1, d, 0, minuteOfDay);
  // Dua iterasi cukup bahkan di sekitar pergantian DST.
  let guess = naive - zoneOffsetMinutes(new Date(naive), timeZone) * 60_000;
  guess = naive - zoneOffsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess);
}

/** Rentang UTC [awal, akhir) untuk satu tanggal kalender sekolah. */
export function schoolDayRangeUtc(
  date: CalendarDate,
  timeZone: string,
): { start: Date; endExclusive: Date } {
  return {
    start: instantFromWallMinutes(date, 0, timeZone),
    endExclusive: instantFromWallMinutes(addDays(date, 1), 0, timeZone),
  };
}
