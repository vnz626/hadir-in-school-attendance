# AGENTS.md: Hadir.in

Aplikasi absensi sekolah: guru membuka sesi, siswa scan QR dinamis di HP (PWA), kehadiran tervalidasi lokasi dan perangkat, orang tua dinotifikasi lewat WhatsApp. Satu sekolah, empat peran: `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`.

## 1. Dokumen acuan (baca sebelum bekerja)

File ini hanya ringkasan aturan. Detail ada di `docs/`:

| Dokumen | Isi | Kapan dibaca |
|---|---|---|
| `docs/rencana-fase-pengembangan.md` | Urutan fase, tugas, definisi selesai | **Awal setiap sesi**, untuk tahu fase aktif |
| `docs/rancangan-aplikasi-absensi-sekolah.md` | Desain UI/UX, data, API, logika, keamanan | Baca **hanya bagian yang dirujuk** fase aktif |

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
- `apps/api`: NestJS, Prisma, PostgreSQL, Redis, BullMQ, SSE untuk realtime
- `packages/shared`: skema Zod, tipe, konstanta status (dipakai FE dan BE)
- `packages/ui-tokens`: **sumber tunggal** token desain
- `e2e/` (Playwright), `load/` (k6), `docs/`

Struktur rinci: Rancangan §19. Jangan menambah dependensi besar tanpa alasan tertulis di ADR.

### Perintah (buat di Fase 1 bila belum ada, lalu pertahankan)

```
pnpm dev            # jalankan web + api
pnpm db:up          # Postgres + Redis lokal (Docker Compose)
pnpm db:reset       # drop + migrate + (tanpa seed)
pnpm db:seed        # seed idempoten
pnpm lint && pnpm typecheck
pnpm test           # unit + integrasi
pnpm test:e2e       # Playwright
```

## 4. Aturan WAJIB (tidak boleh dilanggar)

### Data
- Skema mengikuti Rancangan §10. **Setelah Fase 1 dibekukan**: perubahan hanya lewat migrasi baru + catatan ADR.
- Constraint penting ditegakkan **di database**, bukan hanya di kode: `UNIQUE (session_id, student_id)` pada `attendances`; satu perangkat `ACTIVE` per siswa; satu sesi `OPEN` per kelas per jadwal; `ON DELETE RESTRICT` pada jalur ke data kehadiran. Prisma tidak mendukung indeks parsial, jadi tulis sebagai migrasi SQL mentah.
- **Tidak ada** endpoint, fungsi, atau kueri yang menghapus `attendances` atau `attendance_audits`. Audit hanya bisa ditambah.
- Data master diarsipkan (`deleted_at`), bukan dihapus.
- Waktu disimpan UTC (`timestamptz`). Logika jadwal dan `session_date` memakai zona `Asia/Jakarta`.

### Logika absensi (Rancangan §12)
- Semua keputusan waktu memakai **jam server**. Jangan pernah mempercayai waktu dari klien.
- Gunakan abstraksi `Clock` yang bisa disuntik supaya tes tidak bergantung waktu nyata.
- QR dinamis stateless: HMAC-SHA256 dengan `qr_secret` per sesi, slot 30 detik, terima slot sekarang dan sebelumnya saja, bandingkan dengan **perbandingan waktu konstan**. `qr_secret` tidak pernah dikirim ke klien dan tidak pernah masuk log.
- Penutupan sesi: satu transaksi, `SELECT ... FOR UPDATE`, **idempoten** (aman dijalankan dua kali atau bersamaan).
- Check-in idempoten dan aman dari balapan: konflik unik dipetakan ke `ALREADY_CHECKED_IN`, bukan galat 500.
- Setiap perubahan status setelah pembuatan awal menulis `attendance_audits` dalam transaksi yang sama, dengan alasan wajib.
- Aturan persentase kehadiran: Rancangan §12.8. Jangan mengubahnya tanpa keputusan tertulis.

### Keamanan dan privasi (data anak di bawah umur)
- Otorisasi di **server** untuk setiap endpoint (guard RBAC) **plus pemeriksaan kepemilikan data**: guru hanya kelasnya, siswa hanya dirinya, orang tua hanya anaknya. Setiap endpoint baru wajib punya tes akses negatif (uji IDOR).
- Kata sandi: argon2id. Tidak ada kata sandi bawaan yang sama untuk banyak akun.
- Semua input divalidasi dengan Zod di server. Kueri hanya lewat ORM/parameter.
- **Rahasia hanya lewat variabel lingkungan.** Jangan menulis kunci API, token, atau kredensial ke kode, tes, seed, atau dokumen. Perbarui `.env.example` (tanpa nilai asli).
- Jangan mencatat kata sandi, token, `qr_secret`, atau nomor telepon utuh di log. Maskir nomor di UI selain untuk admin.
- Lokasi hanya diambil saat check-in. Jangan membuat pelacakan berkelanjutan.
- Berkas surat izin diakses lewat URL bertanda tangan berumur pendek.
- Notifikasi WhatsApp hanya ke orang tua dengan `wa_opt_in = true`, lewat antrean, dengan jam kirim 06:00 sampai 20:00 WIB, batas laju, dan retry berbackoff. Jangan pernah mengirim langsung dari request pengguna.

### Kejujuran produk
- Geofence dan pengikatan perangkat adalah lapisan penghalang, bukan bukti mutlak. Jangan menulis klaim "anti-curang 100%" di UI, README, atau komentar.

## 5. Aturan UI/UX (Rancangan §4, §6, §8)

- **Font: Plus Jakarta Sans**, dimuat lewat `next/font/google`, bobot **400, 500, 600, 700, 800** saja, `display: swap`. Fallback `system-ui`. Aktifkan `font-variant-numeric: tabular-nums`.
- **Semua warna, jarak, radius, tipografi berasal dari token** (`packages/ui-tokens`, Rancangan §22). Dilarang menulis hex, px jarak, atau font langsung di komponen.
- Konsep visual: "Buku Absen yang Hidup". Dua ciri khas: komponen `AttendanceStrip` (lajur kehadiran) dan roster hidup. **Kuning pensil `--c-live` hanya untuk sesi yang sedang berlangsung.**
- Tampilan **tidak boleh generik**. Hindari: deretan kartu identik berbayang abu-abu, gradien dekoratif, ikon dalam lingkaran pastel untuk semua hal, label huruf kapital berspasi lebar, animasi masuk pada setiap bagian, efek hover mengangkat pada setiap kartu. Data memakai baris berpembatas tipis, kartu hanya untuk objek berdiri sendiri.
- Radius bertingkat, bukan satu untuk semua: 8 / 16 / 28 (QR) / pill / 3 (segmen).
- Status kehadiran **tidak boleh hanya dibedakan warna**: selalu sertai bentuk ikon dan label atau kode `H T I S A`.
- Gerak hanya untuk menunjukkan perubahan akibat aksi (Rancangan §4.7). Wajib menghormati `prefers-reduced-motion`.
- Target WCAG 2.1 AA: kontras sesuai tabel warna, fokus keyboard terlihat, target sentuh ≥ 44 px, label form terhubung, galat lewat `aria-live`.
- Setiap layar mendefinisikan lima keadaan: memuat (skeleton), kosong, galat, sebagian, tanpa akses.
- Mobile-first untuk siswa dan orang tua (minimum 360 px), desktop-first untuk guru dan admin, mode proyektor 1920 × 1080 untuk layar kelas.

### Microcopy
Bahasa Indonesia sehari-hari yang sopan, sentence case, kata kerja aktif. Satu aksi punya satu nama di seluruh alur (tombol "Tutup sesi" → toast "Sesi ditutup"). Galat menjelaskan apa yang terjadi dan apa yang harus dilakukan, tanpa permintaan maaf berlebihan. Tidak ada panah di akhir label tombol. Semua teks lewat berkas terjemahan, bukan ditulis langsung di komponen.

## 6. Konvensi kode

- TypeScript `strict`. Dilarang `any` tanpa komentar alasan.
- Nama: `snake_case` di database, `camelCase` di kode, `PascalCase` untuk komponen/kelas, tabel jamak.
- Status kehadiran: `PRESENT`, `LATE`, `EXCUSED`, `SICK`, `ABSENT`. Metode: `QR`, `CODE`, `MANUAL`, `LEAVE`, `AUTO`. Gunakan konstanta dari `packages/shared`, jangan menulis string literal.
- Kode galat API (Rancangan §11.3): `QR_EXPIRED`, `QR_INVALID`, `SESSION_CLOSED`, `NO_ACTIVE_SESSION`, `ALREADY_CHECKED_IN`, `OUT_OF_GEOFENCE`, `LOCATION_ACCURACY_LOW`, `DEVICE_MISMATCH`, `NOT_ENROLLED`, `RATE_LIMITED`. Format galat seragam `{ error: { code, message, details } }`, pesan berbahasa Indonesia.
- Endpoint baru wajib punya skema Zod bersama dan masuk OpenAPI (`/api/docs`).
- Pengiriman WhatsApp lewat antarmuka `NotificationProvider`, bukan memanggil penyedia langsung dari logika bisnis.
- Logika murni (QR, status, haversine, rekap) ditulis sebagai fungsi murni dan diuji lebih dulu.
- Komentar menjelaskan **mengapa**, bukan **apa**. Hapus kode mati, jangan dikomentari.

## 7. Pengujian

- Logika inti (Rancangan §12) wajib punya tes unit; modul `sessions`, `checkins`, `attendance` target cakupan ≥ 85%.
- Tes integrasi memakai Postgres sungguhan (Testcontainers), bukan mock, untuk transaksi, constraint, dan RBAC.
- Setiap kriteria penerimaan di Rancangan §16 diterjemahkan menjadi tes otomatis dengan nama yang menyebut kriterianya.
- Tes yang sengaja melanggar constraint database wajib ada (database harus menolak).
- Tes konkurensi: banyak check-in paralel untuk siswa berbeda semua sukses; banyak permintaan paralel untuk siswa yang sama hanya menghasilkan satu baris.
- **Dilarang** menghapus, melewati (`skip`), atau melemahkan tes agar CI hijau. Jika tes salah, jelaskan dulu mengapa, lalu perbaiki.
- Seed realistis (200 siswa, 60 hari riwayat dengan pola nyata) dipakai untuk menguji rekap dan dashboard.

## 8. Git dan PR

- Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`.
- PR kecil, satu tujuan. Deskripsi menyebut fase, butir tugas, dan tes yang ditambah. Perubahan UI menyertakan tangkapan layar pada 360 dan 1440 px.
- Jangan commit `.env`, kunci, atau dump data nyata. CI menjalankan gitleaks.
- Keputusan arsitektur penting dicatat sebagai ADR singkat di `docs/adr/` (konteks, keputusan, konsekuensi).

## 9. Definisi selesai sebuah fitur

Fitur dianggap selesai bila **semuanya** terpenuhi:
1. Kode + tes (termasuk kasus gagal dan akses negatif) lulus.
2. Lint dan typecheck bersih.
3. OpenAPI/ADR diperbarui bila perlu.
4. UI sesuai token dan Figma, kelima keadaan layar ada, lolos pemeriksaan aksesibilitas.
5. Tidak ada rahasia, log sensitif, atau `TODO` tanpa pemilik.
6. Butir "Definisi selesai" fase terkait di rencana fase dipenuhi dengan bukti.

## 10. Saat ragu

- Pertanyaan terbuka (absen harian vs per mapel, penyedia WhatsApp, radius geofence, rumus persentase) punya default di Rancangan §20.3. Pakai default itu dan catat di `docs/open-questions.md`.
- Jangan memperluas lingkup. Ide baru masuk `docs/backlog.md`, bukan ke fase berjalan.
- Jika sebuah instruksi bertentangan dengan aturan di bagian 4 (data, logika, keamanan), **aturan bagian 4 menang**. Hentikan pekerjaan dan laporkan konfliknya.
