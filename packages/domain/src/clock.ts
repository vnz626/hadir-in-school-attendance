/** Semua keputusan waktu memakai Clock yang disuntik, bukan Date.now() langsung (Rancangan §12.11). */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Untuk tes: waktu bisa diatur dan digeser. */
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date | string) {
    this.current = new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(to: Date | string): void {
    this.current = new Date(to);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
