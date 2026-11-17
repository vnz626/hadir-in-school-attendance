import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  login,
  loginAndChangePassword,
  pickRef,
  takeTemporaryPassword,
} from "../fixtures";

// Definisi selesai Fase 2: "Tes e2e: admin menyiapkan sekolah dari nol (pengaturan, kalender, impor, jadwal)"
// dilanjutkan dengan guru, wali kelas, dan siswa memakai akun yang dibuat lewat layar admin.

test.describe.configure({ mode: "serial" });

const NEW_PASSWORD = "Uji-e2e-Baru-1";
const state: { teacherEmail: string; teacherTemp: string; studentTemp: string } = {
  teacherEmail: "",
  teacherTemp: "",
  studentTemp: "",
};

async function openCreate(page: Page, singular: string) {
  await page
    .getByRole("button", { name: `Tambah ${singular}` })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** Isian formulir selalu dicari di dalam dialog: daftar mobile yang tersembunyi di halaman punya label yang sama. */
const dlg = (page: Page) => page.getByRole("dialog");

async function save(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Simpan perubahan" }).click();
}

test("admin masuk: ringkasan, menu admin, dan keadaan kosong data master", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Ringkasan sekolah" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Navigasi utama" }).first();
  for (const item of ["Ringkasan", "Data master", "Impor", "Pengaturan"])
    await expect(nav.getByRole("link", { name: item })).toBeVisible();

  // Keadaan kosong (sekolah dari nol): judul, penjelasan, satu aksi.
  await page.goto("/admin/master/subjects");
  await expect(page.getByText("Belum ada data. Tambahkan yang pertama.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah mata pelajaran" }).first()).toBeVisible();
});

test("pengaturan sekolah: ubah, simpan, dan tetap setelah muat ulang; galat validasi per kolom", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/pengaturan");
  await expect(page.getByRole("heading", { name: "Pengaturan sekolah" })).toBeVisible();

  await page.getByLabel("Nama sekolah").fill("SMP Uji Terpadu");
  await page.getByLabel("Cara absen").selectOption("BOTH");
  await page.getByLabel("Batas isi mundur (hari)").fill("5");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan disimpan")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Nama sekolah")).toHaveValue("SMP Uji Terpadu");
  await expect(page.getByLabel("Cara absen")).toHaveValue("BOTH");
  await expect(page.getByLabel("Batas isi mundur (hari)")).toHaveValue("5");

  // Validasi lintas bidang dijelaskan: batas tutup sebelum jam masuk.
  await page.getByLabel("Batas tutup sesi harian").fill("06:00");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Batas tutup sesi harian harus setelah jam masuk.")).toBeVisible();
});

test("kalender: tahun ajaran aktif, semester, dan hari libur", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  await page.goto("/admin/master/academic-years");
  await openCreate(page, "tahun ajaran");
  await dlg(page).getByLabel("Nama (contoh 2026/2027)").fill("2030/2031");
  await dlg(page).getByLabel("Tanggal mulai").fill("2030-07-01");
  await dlg(page).getByLabel("Tanggal selesai").fill("2031-06-30");
  await page.getByRole("checkbox", { name: "Aktif" }).check();
  await save(page);
  await expect(page.getByText("Data ditambahkan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "2030/2031" })).toBeVisible();

  await page.goto("/admin/master/terms");
  await openCreate(page, "semester");
  await pickRef(page, "Tahun ajaran", "2030", /2030\/2031/);
  await dlg(page).getByLabel("Semester", { exact: true }).selectOption("1");
  await dlg(page).getByLabel("Tanggal mulai").fill("2030-07-15");
  await dlg(page).getByLabel("Tanggal selesai").fill("2030-12-20");
  await save(page);
  await expect(page.getByText("Data ditambahkan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Semester 1" })).toBeVisible();

  // Semester di luar tahun ajarannya dijelaskan, bukan diterima diam-diam.
  await openCreate(page, "semester");
  await pickRef(page, "Tahun ajaran", "2030", /2030\/2031/);
  await dlg(page).getByLabel("Semester", { exact: true }).selectOption("2");
  await dlg(page).getByLabel("Tanggal mulai").fill("2029-01-01");
  await dlg(page).getByLabel("Tanggal selesai").fill("2029-06-01");
  await save(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "di dalam tahun ajarannya",
  );
  await page.keyboard.press("Escape");

  await page.goto("/admin/master/holidays");
  await openCreate(page, "hari libur");
  await dlg(page).getByLabel("Nama", { exact: true }).fill("Hari Kemerdekaan");
  await dlg(page).getByLabel("Dari").fill("2030-08-17");
  await dlg(page).getByLabel("Sampai").fill("2030-08-17");
  await dlg(page).getByLabel("Berlaku untuk").selectOption("ALL");
  await save(page);
  await expect(page.getByText("Data ditambahkan")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hari Kemerdekaan" })).toBeVisible();
});

test("master: mapel, guru (kata sandi sementara sekali), dan kelas dengan wali kelas", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  await page.goto("/admin/master/subjects");
  await openCreate(page, "mata pelajaran");
  await dlg(page).getByLabel("Kode").fill("MTK");
  await dlg(page).getByLabel("Nama", { exact: true }).fill("Matematika");
  await save(page);
  await expect(page.getByRole("cell", { name: "Matematika" })).toBeVisible();

  // Kode ganda dijelaskan.
  await openCreate(page, "mata pelajaran");
  await dlg(page).getByLabel("Kode").fill("MTK");
  await dlg(page).getByLabel("Nama", { exact: true }).fill("Duplikat");
  await save(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("sudah dipakai");
  await page.keyboard.press("Escape");

  await page.goto("/admin/master/teachers");
  state.teacherEmail = `wali.e2e.${Date.now()}@sekolah.test`;
  await openCreate(page, "guru");
  await dlg(page).getByLabel("Nama", { exact: true }).fill("Bu Wali Kelas");
  await dlg(page).getByLabel("Email").fill(state.teacherEmail);
  await save(page);
  state.teacherTemp = await takeTemporaryPassword(page);
  await expect(page.getByRole("cell", { name: "Bu Wali Kelas" })).toBeVisible();

  await page.goto("/admin/master/classes");
  await openCreate(page, "kelas");
  await pickRef(page, "Tahun ajaran", "2030", /2030\/2031/);
  await dlg(page).getByLabel("Nama kelas").fill("7A");
  await dlg(page).getByLabel("Tingkat").fill("7");
  await pickRef(page, "Wali kelas", "Bu Wali", /Bu Wali Kelas/);
  await save(page);
  await expect(page.getByText("Data ditambahkan")).toBeVisible();
  await expect(page.getByRole("row", { name: /7A.*Bu Wali Kelas/ })).toBeVisible();
});

test("impor siswa: pratinjau dengan 3 baris salah, tombol terkunci sampai 'baris valid saja', hasil dan kartu masuk", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/impor");
  await expect(page.getByRole("heading", { name: "Impor data" })).toBeVisible();

  // Templat bisa diunduh.
  const templateLink = page.getByRole("link", { name: "Templat CSV" });
  await expect(templateLink).toHaveAttribute("href", /templates\/STUDENTS\?format=csv/);

  const lines = ["nis,nama,kelas"];
  for (let i = 1; i <= 20; i++) lines.push(`${70000 + i},Siswa ${String(i).padStart(2, "0")},7A`);
  lines[5] = "70005,,7A"; // baris 6: tanpa nama
  lines[9] = "70009,Siswa Kelas Salah,9Z"; // baris 10: kelas tidak ada
  lines[13] = "70002,Siswa NIS Ganda,7A"; // baris 14: NIS ganda dengan baris 3
  await page.locator("#berkas").setInputFiles({
    name: "siswa.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(lines.join("\r\n")),
  });
  await page.getByRole("button", { name: "Unggah dan periksa" }).click();

  await expect(page.getByTestId("import-summary")).toHaveText("20 baris: 17 valid, 3 bermasalah.");
  const table = page.getByRole("table", { name: "Baris bermasalah" });
  await expect(table.getByText("Nama wajib diisi.")).toBeVisible();
  await expect(table.getByText(/Kelas 9Z tidak ditemukan/)).toBeVisible();
  await expect(table.getByText(/NIS ganda: sudah ada di baris 3/)).toBeVisible();
  // Nomor baris mengacu ke baris di berkas (judul = baris 1).
  await expect(table.getByRole("row", { name: /^6\b/ })).toBeVisible();

  const commit = page.getByRole("button", { name: "Jalankan impor" });
  await expect(commit).toBeDisabled();
  await page.getByRole("checkbox", { name: /Impor baris yang valid saja/ }).check();
  await expect(commit).toBeEnabled();
  await commit.click();

  await expect(page.getByTestId("import-result")).toHaveText(
    "17 data dibuat, 3 baris dilewati, 0 gagal disimpan.",
  );

  // Kartu masuk disiapkan worker lalu diunduh lewat URL bertanda tangan.
  const download = page.getByRole("link", { name: "Unduh" });
  await expect(download).toBeVisible({ timeout: 30_000 });
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await file.path();
  expect(fs.readFileSync(path).subarray(0, 5).toString()).toBe("%PDF-");

  // Laporan CSV bisa diunduh.
  const [report] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Unduh laporan (CSV)" }).click(),
  ]);
  expect(report.suggestedFilename()).toBe("laporan-impor.csv");
  const csv = fs.readFileSync((await report.path())!, "utf8");
  expect(csv).toContain("NIS ganda");
  expect(csv.split("\n").length).toBeGreaterThanOrEqual(21);

  // Siswa masuk di daftar data master dengan kelasnya.
  await page.goto("/admin/master/students");
  await expect(page.getByRole("row", { name: /70001.*7A/ })).toBeVisible();
  await expect(page.getByText("17 data")).toBeVisible();
});

test("jadwal: dibuat, dan bentrok guru ditolak dengan penjelasan", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/master/schedules");

  const fill = async () => {
    await pickRef(page, "Semester", "", /Semester 1/);
    await pickRef(page, "Kelas", "7A", /7A/);
    await pickRef(page, "Mata pelajaran", "MTK", /Matematika/);
    await pickRef(page, "Guru", "Bu Wali", /Bu Wali Kelas/);
    await dlg(page).getByLabel("Hari").selectOption("1");
    await dlg(page).getByLabel("Jam mulai").fill("07:30");
    await dlg(page).getByLabel("Jam selesai").fill("08:15");
  };

  await openCreate(page, "jadwal");
  await fill();
  await save(page);
  await expect(page.getByText("Data ditambahkan")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Senin.*07:30 - 08:15.*7A.*Matematika.*Bu Wali Kelas/ }),
  ).toBeVisible();

  await openCreate(page, "jadwal");
  await fill();
  await dlg(page).getByLabel("Jam mulai").fill("08:00");
  await dlg(page).getByLabel("Jam selesai").fill("08:45");
  await save(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Guru itu sudah punya jadwal lain",
  );
});

test("guru baru: wajib ganti kata sandi awal, menu guru, dan tanpa akses ke halaman admin", async ({
  browser,
}) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAndChangePassword(page, state.teacherEmail, state.teacherTemp, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/guru$/);
  await expect(page.getByRole("heading", { name: "Beranda guru" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Navigasi utama" }).first();
  await expect(nav.getByRole("link", { name: "Kelas" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Data master" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByText("Kamu tidak punya akses ke halaman ini")).toBeVisible();
  await page.goto("/admin/pengaturan");
  await expect(page.getByText("Kamu tidak punya akses ke halaman ini")).toBeVisible();
  await ctx.close();
});

test("wali kelas mengatur ulang kata sandi siswa; siswa wajib ganti dan hanya melihat menu siswa", async ({
  browser,
}) => {
  const wali = await browser.newContext();
  const page = await wali.newPage();
  await login(page, state.teacherEmail, NEW_PASSWORD);
  await expect(page).toHaveURL(/\/guru$/);

  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .first()
    .getByRole("link", { name: "Kelas" })
    .click();
  await page.getByRole("link", { name: /7A/ }).click();
  await expect(page.getByRole("heading", { name: "7A" })).toBeVisible();
  await expect(page.getByText(/Kamu wali kelas ini/)).toBeVisible();

  await page
    .getByRole("row", { name: /70001/ })
    .getByRole("button", { name: "Atur ulang kata sandi" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Atur ulang kata sandi Siswa 01?");
  await page.getByRole("dialog").getByRole("button", { name: "Atur ulang kata sandi" }).click();
  state.studentTemp = await takeTemporaryPassword(page);
  await wali.close();

  const siswa = await browser.newContext();
  const sp = await siswa.newPage();
  await loginAndChangePassword(sp, "70001", state.studentTemp, NEW_PASSWORD);
  await expect(sp).toHaveURL(/\/siswa$/);
  const nav = sp.getByRole("navigation", { name: "Navigasi utama" }).first();
  await expect(nav.getByRole("link", { name: "Absen" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Akun" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Kelas" })).toHaveCount(0);
  await sp.goto("/guru/kelas");
  await expect(sp.getByText("Kamu tidak punya akses ke halaman ini")).toBeVisible();
  await siswa.close();
});

test("API menolak permintaan tanpa login dengan format galat seragam", async ({ request }) => {
  for (const path of [
    "/api/students",
    "/api/classes",
    "/api/settings/school",
    "/api/imports/templates/STUDENTS",
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  }
});
