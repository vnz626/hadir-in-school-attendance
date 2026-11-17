// SUMBER TUNGGAL token desain (Rancangan §4.2, §22). Hex hanya boleh ada di berkas ini:
// komponen memakai variabel CSS (`var(--c-ink)`) atau kelas Tailwind turunannya.

export const baseColors = {
  paper: "#F4F6F9",
  surface: "#FFFFFF",
  ink: "#16203A",
  ink2: "#4A5470",
  ink3: "#5F6985",
  line: "#DDE2EC",
  lineStrong: "#8A93A8",
  primary: "#2347C5",
  primaryPress: "#1A37A0",
  primaryTint: "#E6ECFC",
  live: "#FFC93C",
  liveTint: "#FFF4D1",
} as const;

export interface StatusPalette {
  /** Warna solid untuk segmen lajur. */
  solid: string;
  /** Latar tint untuk pil status. */
  bg: string;
  /** Teks di atas tint. */
  fg: string;
  /** Kode huruf (Rancangan §4.8): status tidak boleh hanya dibedakan lewat warna. */
  code: string;
  label: string;
}

export const statusColors = {
  present: { solid: "#1E9E6A", bg: "#E3F5EC", fg: "#136C48", code: "H", label: "Hadir" },
  late: { solid: "#C2620A", bg: "#FDEBD8", fg: "#8A3F00", code: "T", label: "Terlambat" },
  excused: { solid: "#3B82C4", bg: "#E1EEFA", fg: "#1D5FA3", code: "I", label: "Izin" },
  sick: { solid: "#7A5CC9", bg: "#ECE6FA", fg: "#5B3FAE", code: "S", label: "Sakit" },
  dispensed: { solid: "#0F8B8D", bg: "#DDF3F3", fg: "#0B5F61", code: "D", label: "Dispensasi" },
  absent: { solid: "#D6453D", bg: "#FCE6E4", fg: "#A5281F", code: "A", label: "Alpa" },
} as const satisfies Record<string, StatusPalette>;

export type StatusKey = keyof typeof statusColors;

/** "Belum absen": kosong dengan tepi tegas, bukan warna isian. */
export const noneStatus = { border: "#8A93A8", bg: "#EEF0F5", fg: "#4A5470" } as const;

export const radius = { sm: "8px", md: "16px", qr: "28px", pill: "999px", seg: "3px" } as const;

export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
  16: "64px",
} as const;

export const shadow = { float: "0 8px 24px rgba(22, 32, 58, 0.12)" } as const;

export const motion = {
  easeOut: "cubic-bezier(.2, .8, .2, 1)",
  durFast: "120ms",
  durBase: "280ms",
} as const;

export const fontStack = `"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

/** Skala tipografi Rancangan §4.3. */
export const typeScale = {
  display: { size: "44px", line: "48px", weight: 800, tracking: "-0.02em" },
  h1: { size: "28px", line: "34px", weight: 700, tracking: "-0.015em" },
  h2: { size: "22px", line: "28px", weight: 700, tracking: "-0.01em" },
  h3: { size: "18px", line: "24px", weight: 600, tracking: "-0.005em" },
  body: { size: "16px", line: "24px", weight: 400, tracking: "0" },
  sm: { size: "14px", line: "20px", weight: 500, tracking: "0" },
  caption: { size: "12px", line: "16px", weight: 500, tracking: "0.01em" },
} as const;

/**
 * Pasangan warna yang wajib lolos kontras (Rancangan §4.2): teks ≥ 4,5:1, grafis bermakna ≥ 3:1.
 * Dipakai oleh tes otomatis dan siap dipakai halaman katalog.
 */
export interface ContrastPair {
  name: string;
  fg: string;
  bg: string;
  kind: "text" | "graphic";
}

const c = baseColors;

export const contrastPairs: readonly ContrastPair[] = [
  { name: "ink pada surface", fg: c.ink, bg: c.surface, kind: "text" },
  { name: "ink pada paper", fg: c.ink, bg: c.paper, kind: "text" },
  { name: "ink-2 pada surface", fg: c.ink2, bg: c.surface, kind: "text" },
  { name: "ink-2 pada paper", fg: c.ink2, bg: c.paper, kind: "text" },
  { name: "ink-3 pada surface", fg: c.ink3, bg: c.surface, kind: "text" },
  { name: "ink-3 pada paper", fg: c.ink3, bg: c.paper, kind: "text" },
  { name: "teks putih pada primary", fg: c.surface, bg: c.primary, kind: "text" },
  { name: "teks putih pada primary-press", fg: c.surface, bg: c.primaryPress, kind: "text" },
  { name: "primary pada surface (tautan)", fg: c.primary, bg: c.surface, kind: "text" },
  {
    name: "primary pada primary-tint (item aktif)",
    fg: c.primary,
    bg: c.primaryTint,
    kind: "text",
  },
  { name: "ink pada live-tint (banner sesi)", fg: c.ink, bg: c.liveTint, kind: "text" },
  { name: "ink pada live (label di atas kuning)", fg: c.ink, bg: c.live, kind: "text" },
  {
    name: "tepi input (line-strong) pada surface",
    fg: c.lineStrong,
    bg: c.surface,
    kind: "graphic",
  },
  { name: "cincin fokus (primary) pada surface", fg: c.primary, bg: c.surface, kind: "graphic" },
  { name: "cincin fokus (primary) pada paper", fg: c.primary, bg: c.paper, kind: "graphic" },
  { name: "belum absen: ink-2 pada tint", fg: noneStatus.fg, bg: noneStatus.bg, kind: "text" },
  { name: "belum absen: tepi pada surface", fg: noneStatus.border, bg: c.surface, kind: "graphic" },
  ...Object.entries(statusColors).flatMap(([key, p]): ContrastPair[] => [
    { name: `${key}: segmen solid pada surface`, fg: p.solid, bg: c.surface, kind: "graphic" },
    { name: `${key}: teks pada tint`, fg: p.fg, bg: p.bg, kind: "text" },
  ]),
];
