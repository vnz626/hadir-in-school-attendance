import { describe, expect, it } from "vitest";
import {
  MIN_GRAPHIC_CONTRAST,
  MIN_TEXT_CONTRAST,
  baseColors,
  buildTokensCss,
  contrastPairs,
  contrastRatio,
  statusColors,
} from "./index";

describe("rumus kontras WCAG", () => {
  it("hitam pada putih = 21:1, sama dengan sama = 1:1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("urutan argumen tidak berpengaruh", () => {
    expect(contrastRatio("#2347C5", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#2347C5"),
      10,
    );
  });
  it("menolak format warna selain #RRGGBB", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
  });
  it("cocok dengan angka di Rancangan §4.2", () => {
    expect(contrastRatio(baseColors.ink, baseColors.surface)).toBeGreaterThan(15.8);
    expect(contrastRatio(baseColors.ink2, baseColors.surface)).toBeGreaterThan(7.4);
    expect(contrastRatio(baseColors.ink3, baseColors.surface)).toBeCloseTo(5.46, 1);
    expect(contrastRatio(baseColors.ink3, baseColors.paper)).toBeCloseTo(5.04, 1);
    expect(contrastRatio(baseColors.lineStrong, baseColors.surface)).toBeCloseTo(3.08, 1);
    expect(contrastRatio(baseColors.surface, baseColors.primary)).toBeCloseTo(7.56, 1);
  });
});

describe("kontras semua pasangan warna Rancangan §4.2", () => {
  it.each(contrastPairs.map((p) => [p.name, p] as const))("%s", (_name, p) => {
    const min = p.kind === "text" ? MIN_TEXT_CONTRAST : MIN_GRAPHIC_CONTRAST;
    expect(contrastRatio(p.fg, p.bg), `${p.name}: ${p.fg} pada ${p.bg}`).toBeGreaterThanOrEqual(
      min,
    );
  });

  it("setiap status punya kode huruf unik (tidak hanya dibedakan warna)", () => {
    const codes = Object.values(statusColors).map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual(["A", "D", "H", "I", "S", "T"]);
  });

  it("kuning pensil tidak dipakai oleh status kehadiran mana pun", () => {
    for (const p of Object.values(statusColors)) {
      expect(p.solid.toLowerCase()).not.toBe(baseColors.live.toLowerCase());
      expect(p.bg.toLowerCase()).not.toBe(baseColors.liveTint.toLowerCase());
    }
  });
});

describe("CSS yang dibangkitkan", () => {
  const css = buildTokensCss();
  it("memuat variabel inti dan pemetaan tema Tailwind", () => {
    expect(css).toContain("--c-primary: #2347C5;");
    expect(css).toContain("--s-absent-fg: #A5281F;");
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-status-late: var(--s-late);");
    expect(css).toContain("--radius-qr: var(--r-qr);");
  });
  it("menghormati prefers-reduced-motion dan angka tabular", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });
});
