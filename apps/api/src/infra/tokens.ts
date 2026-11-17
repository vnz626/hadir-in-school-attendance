// Token injeksi untuk layanan di balik antarmuka (Rancangan §9.1). Logika bisnis tidak boleh tahu
// implementasi mana yang aktif.
export const CLOCK = Symbol("CLOCK");
export const RATE_LIMITER = Symbol("RATE_LIMITER");
export const MAILER = Symbol("MAILER");
export const FILE_STORAGE = Symbol("FILE_STORAGE");
export const JOB_QUEUE = Symbol("JOB_QUEUE");
