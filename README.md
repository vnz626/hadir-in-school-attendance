# hadir.in

Aplikasi absensi sekolah: guru membuka sesi, siswa scan QR dinamis di HP, atau guru memakai mode cepat tanpa HP siswa. Kehadiran divalidasi lokasi dan perangkat (lapisan penghalang, bukan bukti mutlak), dan orang tua diberi tahu lewat WhatsApp.

Status: **Fase 1 (fondasi proyek dan data)**. Aturan kerja ada di `AGENTS.md`; urutan fase di `docs/rencana-fase-pengembangan.md`.

## Prasyarat (Windows, lokal)

- Node.js 22 LTS
- pnpm 9 (`npm i -g pnpm@9`)
- XAMPP dengan modul **MySQL/MariaDB 10.4** menyala (Apache tidak wajib)

## Menyiapkan MariaDB XAMPP (sekali saja)

Edit `C:\xampp\mysql\bin\my.ini`, bagian `[mysqld]`:

```ini
bind-address = 127.0.0.1
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
default-time-zone = '+00:00'
sql_mode = STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION
```

Restart MySQL dari XAMPP Control Panel. `bind-address` membuat database tidak terbuka ke jaringan Wi-Fi. Aplikasi tetap memaksa zona `+00:00` dan mode ketat pada setiap koneksinya, jadi data benar walau `my.ini` belum diubah, tetapi `bind-address` tidak bisa diatur dari aplikasi.

## Dari nol sampai jalan

```bash
pnpm install
cp .env.example .env   # lalu isi DB_APP_PASSWORD, kata sandi SEED_*, dan QR_SECRET_ENC_KEY (nilai bebas dan unik)
pnpm db:setup          # buat hadirin_dev, hadirin_test, hadirin_shadow + pengguna hadirin (minta kata sandi root sekali)
pnpm db:migrate        # migrasi Prisma + trigger
pnpm db:seed           # 200 siswa, 60 hari riwayat
pnpm dev               # web :3000, api :4000, worker
```

Buka `http://localhost:3000` dan `http://localhost:3000/api/health`.

## Perintah

| Perintah                                           | Fungsi                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm db:setup`                                    | Membuat database dan pengguna `hadirin` (bukan root)                        |
| `pnpm db:migrate`                                  | `prisma migrate deploy` lalu `prisma/sql/triggers.sql`                      |
| `pnpm --filter @hadirin/api db:migrate:new <nama>` | Membuat migrasi baru tanpa menerapkannya (tambahkan `CHECK` manual dulu)    |
| `pnpm db:reset`                                    | Mengosongkan dan memigrasi ulang `hadirin_dev` (tanpa seed)                 |
| `pnpm db:seed`                                     | Seed idempoten; `pnpm --filter @hadirin/api db:seed:load` untuk 1.000 siswa |
| `pnpm db:backup`                                   | `mysqldump` ke `backups/`                                                   |
| `pnpm check`                                       | lint + typecheck + test (`hadirin_test` dikosongkan otomatis)               |

Perubahan struktur tabel hanya lewat migrasi, tidak lewat phpMyAdmin. **Skema dibekukan sejak akhir Fase 1**: jangan mengedit migrasi `20261113212845_init`; buat migrasi baru dan catat ADR di `docs/adr/`.

## Akun demo

Setelah seed, kata sandi ada di `.env` (`SEED_*`):

| Peran     | Login                                             |
| --------- | ------------------------------------------------- |
| Admin     | `admin@hadirin.test`                              |
| Guru      | `guru1@hadirin.test`                              |
| Siswa     | NIS siswa pertama (`<tahun>000001`)               |
| Orang tua | tanpa kata sandi (masuk lewat tautan/OTP, Fase 2) |

Akun lain sengaja belum punya kata sandi: tidak ada kata sandi bersama untuk banyak akun.

## Struktur

`apps/web` (Next.js), `apps/api` (NestJS + Prisma 7), `packages/shared` (konstanta, skema Zod), `packages/domain` (fungsi murni: waktu, kalender, rekap, status harian), `packages/ui-tokens`, `packages/config`, `docs/`.
