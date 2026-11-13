import "reflect-metadata";

// Worker: pemroses antrean tabel `jobs` ditambahkan di Fase 3. Di Fase 1 hanya kerangka proses.
const HEARTBEAT_MS = 30_000;
console.log("[worker] siap (belum ada handler job)");
setInterval(() => undefined, HEARTBEAT_MS);
