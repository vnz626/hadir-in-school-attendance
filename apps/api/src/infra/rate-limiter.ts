import type { Clock } from "@hadirin/domain";

/**
 * Pembatas laju dengan jendela geser (Rancangan §12.6). Antarmuka sengaja kecil: kunci, jendela,
 * catat satu kejadian, hitung kejadian. Aturan batas (misalnya "5 gagal -> jeda 15 menit") ada di
 * pemakainya, supaya adapter Redis nanti cukup mengganti penyimpanan.
 */
export interface RateLimiter {
  /** Mencatat satu kejadian untuk `key`. */
  hit(key: string, windowMs: number): void;
  /** Jumlah kejadian dalam `windowMs` terakhir. */
  count(key: string, windowMs: number): number;
  /** Milidetik sampai kejadian tertua keluar dari jendela (untuk header Retry-After). */
  retryAfterMs(key: string, windowMs: number): number;
  reset(key: string): void;
}

/** Implementasi di memori proses: cukup untuk satu instance API tahap lokal. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly clock: Clock) {}

  private prune(key: string, windowMs: number): number[] {
    const cutoff = this.clock.now().getTime() - windowMs;
    const list = (this.events.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) this.events.delete(key);
    else this.events.set(key, list);
    return list;
  }

  hit(key: string, windowMs: number): void {
    const list = this.prune(key, windowMs);
    list.push(this.clock.now().getTime());
    this.events.set(key, list);
  }

  count(key: string, windowMs: number): number {
    return this.prune(key, windowMs).length;
  }

  retryAfterMs(key: string, windowMs: number): number {
    const list = this.prune(key, windowMs);
    if (list.length === 0) return 0;
    return Math.max(0, list[0]! + windowMs - this.clock.now().getTime());
  }

  reset(key: string): void {
    this.events.delete(key);
  }
}
