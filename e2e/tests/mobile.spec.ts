import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login } from "../fixtures";

// Proyek "mobile": viewport 360 px (Rancangan §8: semua halaman WAJIB usable di 360 px).

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "halaman tidak boleh bergulir ke samping").toBeLessThanOrEqual(0);
}

test("halaman masuk di 360 px: hanya form, tanpa gulir samping, target sentuh >= 44 px", async ({
  page,
}) => {
  await page.goto("/masuk");
  await expect(page.getByRole("heading", { name: "Masuk ke akun" })).toBeVisible();
  // Lajur kehadiran dekoratif hanya untuk desktop.
  await expect(page.getByText("Absen kelas selesai dalam hitungan detik.")).toBeHidden();
  await noHorizontalScroll(page);

  for (const target of [
    page.getByLabel("Email atau NIS"),
    page.getByLabel("Kata sandi", { exact: true }),
    page.getByRole("button", { name: "Masuk", exact: true }),
    page.getByRole("button", { name: "Lupa kata sandi?" }),
  ]) {
    const box = await target.boundingBox();
    expect(box!.height, "tinggi target sentuh").toBeGreaterThanOrEqual(44);
  }
  // Input 16 px agar iOS tidak memperbesar halaman saat fokus.
  const fontSize = await page
    .getByLabel("Email atau NIS")
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

test("galat login ditampilkan tanpa membocorkan mana yang salah", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email atau NIS").fill("tidak-ada@sekolah.test");
  await page.getByLabel("Kata sandi", { exact: true }).fill("salah-salah-1");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "tidak cocok" })).toHaveText(
    "Email/NIS atau kata sandi tidak cocok.",
  );
});

test("admin di 360 px: navigasi bawah, daftar baris (bukan tabel), tanpa gulir samping", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  // Navigasi samping tersembunyi; navigasi bawah tampil dengan ikon dan label.
  const bottomNav = page.getByRole("navigation", { name: "Navigasi utama" }).last();
  await expect(bottomNav).toBeVisible();
  for (const item of ["Ringkasan", "Data master", "Impor", "Pengaturan"]) {
    const link = bottomNav.getByRole("link", { name: item });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  await noHorizontalScroll(page);

  await page.goto("/admin/master/students");
  await expect(page.getByRole("list", { name: "Siswa" })).toBeVisible();
  await expect(page.getByRole("table")).toBeHidden();
  await noHorizontalScroll(page);

  // Formulir menjadi bottom sheet yang tetap muat di layar.
  await page.getByRole("button", { name: "Tambah siswa" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(780);
  await page.keyboard.press("Escape");

  for (const path of ["/admin/impor", "/admin/pengaturan", "/admin/master/schedules"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await noHorizontalScroll(page);
  }
});
