# AGENTS.md: Hadir.in

Aplikasi absensi sekolah: guru membuka sesi, siswa scan QR dinamis di HP (PWA) **atau** guru memakai mode cepat tanpa HP siswa, kehadiran tervalidasi lokasi dan perangkat, orang tua dinotifikasi lewat WhatsApp. Satu sekolah, empat peran: `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. Akses guru diperhalus lewat **jabatan** (wali kelas, piket, BK, kepala sekolah) dan penugasan guru pengganti, bukan peran baru (Rancangan §2.1).

## 1. Dokumen acuan (baca sebelum bekerja)

File ini hanya ringkasan aturan. Detail ada di `docs/`:

| Dokumen | Isi | Kapan dibaca |
|---|---|---|
| `docs/rencana-fase-pengembangan.md` | Urutan fase, tugas, definisi selesai | **Awal setiap sesi**, untuk tahu fase aktif |
| `docs/rancangan-aplikasi-absensi-sekolah.md` (versi 2.0) | Desain UI/UX, data, API, logika, keamanan | Baca **hanya bagian yang dirujuk** fase aktif. Bagian 0 merangkum perubahan versi |

Rujukan "Rancangan §N" artinya bagian bernomor N di dokumen rancangan. Jangan membaca ulang seluruh dokumen tiap sesi.

Jika dokumen dan kode bertentangan, **dokumen yang benar**, kecuali ada ADR di `docs/adr/` yang menggantinya. Jika dokumen ambigu atau bertentangan dengan dirinya sendiri, jangan menebak: catat di `docs/open-questions.md` dan pilih default paling konservatif yang tertulis di Rancangan §20.3.

## 2. Cara bekerja

1. Kerjakan **hanya fase yang diminta**. Jangan mengerjakan fase lain atau fitur P2 (Rancangan §3) walau terlihat mudah.
2. Mulai dengan **rencana tertulis**: file apa yang diubah, tabel/endpoint apa yang terpengaruh, tes apa yang ditambah. Tunggu persetujuan untuk perubahan skema, auth, atau logika di Rancangan §12.
3. Kerjakan dalam langkah kecil yang bisa ditinjau. Satu perubahan = satu tujuan.
4. Sebelum menyatakan selesai, jalankan lint, typecheck, dan seluruh tes, lalu **tempelkan hasil perintahnya**. Jangan menulis "sudah berfungsi" tanpa bukti.
5. Akhiri fase dengan ringkasan: apa yang selesai, apa yang berbeda dari rencana, apa yang ditunda, daftar butir "Definisi selesai" fase itu beserta statusnya (lulus/tidak, dengan bukti).
6. Jika sebuah butir tidak bisa dipenuhi, **katakan terus terang**. Jangan menurunkan standar atau menghapus tes agar hijau.

## 3. Stack dan struktur

Monorepo pnpm + Turborepo.

- `apps/web`: Next.js (App Router), TypeScript, Tailwind, Radix UI, TanStack Query
- `apps/api`: NestJS, **Prisma 7.x** (provider `mysql`, `@prisma/adapter-mariadb`), **MariaDB dari XAMPP**, SSE untuk realtime. Entrypoint terpisah untuk `api` dan `worker`. **Tanpa Redis**: antrean di tabel `jobs`, kunci idempoten di tabel `idempotency_keys`, cache/rate limit/`EventBus` di memori, semuanya lewat antarmuka di `src/infra/` (Rancangan §9.1)
- `packages/shared`: skema Zod, tipe, konstanta status, kode galat (dipakai FE dan BE)
- `packages/domain`: fungsi murni Rancangan §12 (QR, waktu acuan, status, kalender, rekap, status harian), tanpa I/O
- `packages/ui-tokens`: **sumber tunggal** token desain
- `e2e/` (Playwright), `load/` (k6), `docs/`

Struktur rinci: Rancangan §19. Jangan menambah dependensi besar tanpa alasan tertulis di ADR.

### Lingkungan: lokal dengan XAMPP (Rancangan §9.3)

- Tahap sekarang **hanya lokal** di Windows: XAMPP (cukup modul MySQL/MariaDB 10.4.32) + Node.js 22 LTS + pnpm. Tidak ada Docker, Redis, atau layanan cloud. Jangan menambahkannya tanpa ADR.
- Aplikasi memakai pengguna database `hadirin`, **bukan** `root`. Database: `hadirin_dev` dan `hadirin_test`.
- Skema ditulis dalam subset **MariaDB 10.4 + MySQL 8**. Jangan memakai fitur khusus salah satunya (misalnya `SKIP LOCKED`, `RETURNING`, tipe `UUID`, `JSON_TABLE`).
- Prisma **dikunci di 7.x**. Prisma 8 belum mendukung MySQL/MariaDB.
- Perubahan struktur tabel hanya lewat migrasi, **tidak pernah** lewat phpMyAdmin.
- Web dan API satu origin: browser hanya ke Next.js (port 3000), `/api/*` diteruskan ke NestJS (port 4000) lewat rewrites (ADR 004).
- Uji kamera dan lokasi di HP **selalu lewat tunnel HTTPS** (`pnpm dev:tunnel`), karena `http://192.168.x.x` bukan konteks aman.
- Layanan luar memakai implementasi lokal secara default: notifikasi dan email `console`, berkas di folder `storage/`.

### Perintah (buat di Fase 1 bila belum ada, lalu pertahankan)

```
pnpm db:setup       # buat database + pengguna hadirin di MariaDB XAMPP (sekali)
pnpm db:migrate     # migrasi Prisma + prisma/sql/triggers.sql
pnpm db:reset       # kosongkan + migrasi ulang hadirin_dev (tanpa seed)
pnpm db:seed        # seed idempoten
pnpm db:backup      # mysqldump ke backups/
pnpm dev            # web + api + worker
pnpm dev:tunnel     # tunnel HTTPS untuk uji di HP
pnpm lint && pnpm typecheck
pnpm test           # unit + integrasi (hadirin_test)
pnpm test:e2e       # Playwright
pnpm check          # lint + typecheck + test (pengganti CI selama tahap lokal)
```

## 4. Aturan WAJIB (tidak boleh dilanggar)

### Data
- Skema mengikuti Rancangan §10. **Setelah Fase 1 dibekukan**: perubahan hanya lewat migrasi baru + catatan ADR.
- Constraint penting ditegakkan **di database**, bukan hanya di kode (daftar lengkap Rancangan §10.3). Minimal:
  - `UNIQUE (session_id, student_id)` pada `attendances`.
  - MariaDB tidak punya index parsial, jadi keunikan bersyarat memakai **kolom kunci** + `UNIQUE` + `CHECK` konsistensi (Rancangan §10.3): `schedule_slot_key` dan `daily_slot_key` (satu sesi per jadwal per tanggal, satu sesi `DAILY` per kelas per tanggal), `active_student_key` (satu perangkat `ACTIVE` per siswa), `open_enrollment_key` (satu pendaftaran terbuka per siswa per tahun ajaran). Kolom kunci diisi oleh satu fungsi repositori per tabel, tidak ditulis manual di banyak tempat.
  - `UNIQUE (dedupe_key)` pada `notifications` dan `jobs`; `UNIQUE (scope, key)` pada `idempotency_keys`.
  - `ON DELETE RESTRICT ON UPDATE RESTRICT` pada jalur ke data kehadiran.
  - `CHECK` ditambahkan manual ke berkas migrasi (`prisma migrate dev --create-only`). Trigger ditulis di `prisma/sql/triggers.sql` yang idempoten dan dijalankan `pnpm db:migrate`.
- **Tidak ada** endpoint, fungsi, atau kueri yang menghapus `attendances` atau mengubah/menghapus `attendance_audits` dan `audit_logs`. Trigger database menegakkannya.
- Data master diarsipkan (`deleted_at`), bukan dihapus.
- Kelas siswa selalu lewat `class_enrollments`, bukan kolom di `students`. Rekap memakai rentang pendaftaran.
- Koordinat lokasi mentah check-in **tidak disimpan**. Yang disimpan hanya `distance_m`, `accuracy_m`, `geofence_id`.
- Waktu disimpan UTC di `DATETIME(3)`; tanggal kalender `DATE`; jam dinding `SMALLINT` menit sejak 00:00 (bukan `TIME`). Logika kalender, jadwal, `session_date`, dan jam kirim notifikasi memakai `schools.timezone`, **dikonversi di aplikasi**. Jangan memakai `CONVERT_TZ()`, `NOW()`, atau `CURDATE()` di SQL untuk keputusan bisnis (MariaDB XAMPP tidak punya tabel zona waktu, dan waktu harus dari `Clock`). Jangan menulis zona waktu langsung di kode.

### Logika absensi (Rancangan §12)
- Semua keputusan waktu memakai **jam server**. Jangan pernah mempercayai waktu dari klien.
- Gunakan abstraksi `Clock` yang bisa disuntik supaya tes tidak bergantung waktu nyata.
- QR dinamis stateless: HMAC-SHA256 dengan `qr_secret` per sesi, slot 30 detik, terima slot sekarang dan sebelumnya saja, bandingkan dengan **perbandingan waktu konstan**. `qr_secret` tidak pernah dikirim ke klien dan tidak pernah masuk log.
- Terlambat diukur dari `late_threshold_at` yang dihitung saat sesi dibuka dari **jam jadwal**, bukan dari jam sesi dibuka (Rancangan §12.4).
- Penutupan sesi: satu transaksi, `SELECT ... FOR UPDATE`, **idempoten** (aman dijalankan dua kali atau bersamaan), dengan pemindai cadangan untuk job yang hilang.
- Check-in idempoten dan aman dari balapan: `Idempotency-Key` di tabel `idempotency_keys`, dan konflik unik dipetakan ke `ALREADY_CHECKED_IN` (HTTP 200), bukan galat 500.
- Mode cepat (`bulk`) tidak boleh menimpa baris hasil QR/kode.
- Setiap perubahan status setelah pembuatan awal menulis `attendance_audits` dalam transaksi yang sama, termasuk perubahan oleh sistem (`actor_type = SYSTEM`). Alasan wajib untuk koreksi pada sesi `CLOSED`.
- Pengajuan yang disetujui mengubah `ABSENT` menjadi status pengajuan, **tidak pernah** menimpa `PRESENT`/`LATE` (Rancangan §12.5).
- Rate limit per siswa dan per perangkat. Batas per IP hanya penahan banjir yang longgar, karena seluruh sekolah sering memakai satu IP publik.
- Aturan persentase (Rancangan §12.8) dan status harian (Rancangan §12.9): jangan mengubahnya tanpa keputusan tertulis. Hari tanpa sesi adalah "Tidak tercatat", bukan alpa.

### Keamanan dan privasi (data anak di bawah umur)
- Otorisasi di **server** untuk setiap endpoint (guard RBAC) **plus pemeriksaan kepemilikan data lewat satu layanan `AccessPolicy`** yang memahami peran, wali kelas, jabatan, dan penugasan pengganti (tabel di Rancangan §14.1). Jangan menulis pemeriksaan akses manual per endpoint. Setiap endpoint baru wajib punya tes akses negatif (uji IDOR).
- Kata sandi: argon2id. Tidak ada kata sandi bawaan yang sama untuk banyak akun.
- Semua input divalidasi dengan Zod di server. Kueri hanya lewat ORM/parameter.
- **Rahasia hanya lewat variabel lingkungan.** Jangan menulis kunci API, token, atau kredensial ke kode, tes, seed, atau dokumen. Perbarui `.env.example` (tanpa nilai asli).
- Jangan mencatat kata sandi, token, `qr_secret`, atau nomor telepon utuh di log. Maskir nomor di UI selain untuk admin.
- Lokasi hanya diambil saat check-in. Jangan membuat pelacakan berkelanjutan.
- Berkas surat izin diakses lewat URL bertanda tangan berumur pendek.
- Notifikasi WhatsApp hanya ke orang tua dengan `wa_opt_in = true`, lewat antrean, dengan jam kirim menurut zona waktu sekolah (default 06:00 sampai 20:00), `dedupe_key`, batas laju, dan retry berbackoff. Alpa sesi mapel dikirim sebagai ringkasan harian, bukan per sesi (Rancangan §13.1). Jangan pernah mengirim langsung dari request pengguna.

### Kejujuran produk
- Geofence dan pengikatan perangkat adalah lapisan penghalang, bukan bukti mutlak. Jangan menulis klaim "anti-curang 100%" di UI, README, atau komentar.

## 5. Aturan UI/UX (Rancangan §4, §6, §8)

- **Font: Plus Jakarta Sans**, dimuat lewat `next/font/google`, bobot **400, 500, 600, 700, 800** saja, `display: swap`. Fallback `system-ui`. Aktifkan `font-variant-numeric: tabular-nums`.
- **Semua warna, jarak, radius, tipografi berasal dari token** (`packages/ui-tokens`, Rancangan §22). Dilarang menulis hex, px jarak, atau font langsung di komponen.
- Konsep visual: "Buku Absen yang Hidup". Dua ciri khas: komponen `AttendanceStrip` (lajur kehadiran) dan roster hidup. **Kuning pensil `--c-live` hanya untuk sesi yang sedang berlangsung**, karena itu tidak ada status kehadiran yang berwarna kuning (Terlambat memakai oranye).
- Tampilan **tidak boleh generik**. Hindari: deretan kartu identik berbayang abu-abu, gradien dekoratif, ikon dalam lingkaran pastel untuk semua hal, label huruf kapital berspasi lebar, animasi masuk pada setiap bagian, efek hover mengangkat pada setiap kartu. Data memakai baris berpembatas tipis, kartu hanya untuk objek berdiri sendiri.
- Radius bertingkat, bukan satu untuk semua: 8 / 16 / 28 (QR) / pill / 3 (segmen).
- Status kehadiran **tidak boleh hanya dibedakan warna**: selalu sertai bentuk ikon dan label atau kode `H T I S D A`.
- Gerak hanya untuk menunjukkan perubahan akibat aksi (Rancangan §4.7). Wajib menghormati `prefers-reduced-motion`.
- Target WCAG 2.1 AA: kontras teks ≥ 4,5:1 dan elemen grafis bermakna ≥ 3:1 sesuai tabel warna, fokus keyboard terlihat (termasuk mode cepat), target sentuh ≥ 44 px, label form terhubung, galat lewat `aria-live`.
- Setiap layar mendefinisikan lima keadaan: memuat (skeleton), kosong, galat, sebagian, tanpa akses.
- Mobile-first untuk siswa dan orang tua (minimum 360 px), desktop-first untuk guru dan admin, mode proyektor 1920 × 1080 untuk layar kelas. Layar sesi guru dan mode cepat tetap harus bisa dipakai penuh di 360 px (guru tanpa laptop).

### Microcopy
Bahasa Indonesia sehari-hari yang sopan, sentence case, kata kerja aktif. Satu aksi punya satu nama di seluruh alur (tombol "Tutup sesi" → toast "Sesi ditutup"). Galat menjelaskan apa yang terjadi dan apa yang harus dilakukan, tanpa permintaan maaf berlebihan. Tidak ada panah di akhir label tombol. Semua teks lewat berkas terjemahan, bukan ditulis langsung di komponen.

## 6. Konvensi kode

- TypeScript `strict`. Dilarang `any` tanpa komentar alasan.
- Nama: `snake_case` di database, `camelCase` di kode, `PascalCase` untuk komponen/kelas, tabel jamak.
- Status kehadiran: `PRESENT`, `LATE`, `EXCUSED`, `SICK`, `DISPENSED`, `ABSENT`. Metode: `QR`, `CODE`, `MANUAL`, `LEAVE`, `AUTO`. Jabatan: `PICKET`, `COUNSELOR`, `PRINCIPAL`. Gunakan konstanta dari `packages/shared`, jangan menulis string literal.
- Kode galat check-in (Rancangan §11.3): `QR_EXPIRED`, `QR_INVALID`, `SESSION_CLOSED`, `NO_ACTIVE_SESSION`, `ALREADY_CHECKED_IN`, `OUT_OF_GEOFENCE`, `LOCATION_ACCURACY_LOW`, `LOCATION_REQUIRED`, `DEVICE_MISMATCH` (dengan `details.resolution`), `NOT_ENROLLED`, `RATE_LIMITED`. Kode umum: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `HOLIDAY`, `SESSION_ALREADY_OPEN`, `BACKFILL_WINDOW_PASSED`. Format galat seragam `{ error: { code, message, details } }`, pesan berbahasa Indonesia.
- Endpoint baru wajib punya skema Zod bersama dan masuk OpenAPI (`/api/docs`).
- Pengiriman WhatsApp lewat antarmuka `NotificationProvider`, bukan memanggil penyedia langsung dari logika bisnis.
- Logika murni (QR, waktu acuan, status, haversine, kalender, rekap, status harian) ditulis sebagai fungsi murni di `packages/domain` dan diuji lebih dulu.
- Komentar menjelaskan **mengapa**, bukan **apa**. Hapus kode mati, jangan dikomentari.

## 7. Pengujian

- Logika inti (Rancangan §12) wajib punya tes unit; modul `sessions`, `checkins`, `attendance`, `reports` target cakupan ≥ 85%.
- Tes integrasi memakai MariaDB sungguhan (database `hadirin_test` di XAMPP, dikosongkan dan dimigrasi ulang sebelum rangkaian tes), bukan mock, untuk transaksi, constraint, `CHECK`, trigger, RBAC, idempotensi, dan antrean `jobs`.
- Handler job WAJIB idempoten dan punya tes: job dijalankan dua kali, dan worker mati di tengah job lalu lease habis.
- Tes zona waktu wajib: sekolah di zona selain WIB (misalnya `Asia/Jayapura`) dan batas tengah malam.
- Setiap kriteria penerimaan di Rancangan §16 diterjemahkan menjadi tes otomatis dengan nama yang menyebut kriterianya.
- Tes yang sengaja melanggar constraint database wajib ada (database harus menolak).
- Tes konkurensi: banyak check-in paralel untuk siswa berbeda semua sukses; banyak permintaan paralel untuk siswa yang sama hanya menghasilkan satu baris; mode cepat dan check-in bersamaan tidak saling menimpa.
- **Dilarang** menghapus, melewati (`skip`), atau melemahkan tes agar `pnpm check` hijau. Jika tes salah, jelaskan dulu mengapa, lalu perbaiki.
- Seed realistis (Rancangan §17: 200 siswa, 60 hari riwayat, siswa pindah kelas, kakak-adik, jadwal tanpa sesi) dipakai untuk menguji rekap dan dashboard.

## 8. Git dan PR

- **Agen AI tidak membuat commit, push, atau branch.** Developer yang memutuskan kapan dan apa yang di-commit. Agen cukup melaporkan berkas yang berubah.
- Saat developer meng-commit: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Perubahan kecil, satu tujuan. Ringkasan pekerjaan menyebut fase, butir tugas, berkas yang berubah, dan tes yang ditambah. Perubahan UI menyertakan tangkapan layar pada 360 dan 1440 px.
- `.env`, `storage/`, `backups/`, dan dump data nyata tidak boleh masuk Git (pastikan ada di `.gitignore`).
- Keputusan arsitektur penting dicatat sebagai ADR singkat di `docs/adr/` (konteks, keputusan, konsekuensi).

## 9. Definisi selesai sebuah fitur

Fitur dianggap selesai bila **semuanya** terpenuhi:
1. Kode + tes (termasuk kasus gagal dan akses negatif) lulus.
2. Lint dan typecheck bersih.
3. OpenAPI/ADR diperbarui bila perlu.
4. UI sesuai token dan desain (ditinjau lewat tangkapan layar 360/1440/1920 px), kelima keadaan layar ada, lolos pemeriksaan aksesibilitas.
5. Tidak ada rahasia, log sensitif, atau `TODO` tanpa pemilik.
6. Butir "Definisi selesai" fase terkait di rencana fase dipenuhi dengan bukti.

## 10. Saat ragu

- Pertanyaan terbuka (mode absen, penyedia WhatsApp, radius geofence, rumus persentase, kebijakan HP, jam sekolah, dan lainnya) punya default di Rancangan §20.3. Pakai default itu dan catat di `docs/open-questions.md`.
- Bila waktu meleset, pangkas hanya sesuai "Daftar pangkas" di rencana fase bagian 5. Butir yang tertulis "tidak boleh dipangkas" tetap dikerjakan penuh.
- Jangan memperluas lingkup. Ide baru masuk `docs/backlog.md`, bukan ke fase berjalan.
- Jika sebuah instruksi bertentangan dengan aturan di bagian 4 (data, logika, keamanan), **aturan bagian 4 menang**. Hentikan pekerjaan dan laporkan konfliknya.
