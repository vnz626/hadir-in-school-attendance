import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login } from "../fixtures";

// WCAG 2.1 AA (AGENTS.md §5, §9): pemeriksaan otomatis axe pada layar utama, lalu uji keyboard manual.
// Berjalan setelah skenario penyiapan sekolah, jadi tabel berisi data nyata.

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, `Pelanggaran aksesibilitas di ${name}`).toEqual([]);
}

test("halaman publik tanpa pelanggaran aksesibilitas", async ({ page }) => {
  for (const path of [
    "/masuk",
    "/lupa-kata-sandi",
    "/atur-ulang?token=contoh-token-panjang-sekali",
    "/dev/komponen",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page, path);
  }
});

test("layar admin tanpa pelanggaran aksesibilitas", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  for (const path of [
    "/admin",
    "/admin/master",
    "/admin/master/students",
    "/admin/master/classes",
    "/admin/master/schedules",
    "/admin/master/holidays",
    "/admin/impor",
    "/admin/pengaturan",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main h1")).toBeVisible();
    await expectNoViolations(page, path);
  }
});

test("dialog formulir dan konfirmasi tanpa pelanggaran, fokus terkunci, Esc menutup", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/master/students");
  await expect(page.getByRole("row", { name: /70001/ })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Tambah siswa" }).first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expectNoViolations(page, "dialog tambah siswa");

  // Fokus berada di dalam dialog dan tetap di sana saat Tab berulang kali (fokus terkunci).
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]"))),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // Fokus kembali ke pemicu setelah dialog ditutup.
  await expect(trigger).toBeFocused();

  await page
    .getByRole("row", { name: /70001/ })
    .getByRole("button", { name: "Atur ulang kata sandi" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoViolations(page, "dialog konfirmasi");
  await page.keyboard.press("Escape");
});

test("keyboard: tautan lewati ke isi, fokus terlihat, dan menu bisa dioperasikan tanpa mouse", async ({
  page,
}) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);

  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Lewati ke isi halaman" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();

  // Indikator fokus terlihat (cincin 2 px) pada tautan menu.
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .first()
    .getByRole("link", { name: "Data master" })
    .focus();
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return { width: parseFloat(s.outlineWidth), style: s.outlineStyle };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/master$/);
});

test("status tidak hanya dibedakan warna: pil status membawa ikon dan label teks", async ({
  page,
}) => {
  await page.goto("/dev/komponen");
  const pills = page.locator(
    "span:has(svg) >> text=/^(Hadir|Terlambat|Izin|Sakit|Dispensasi|Alpa)$/",
  );
  expect(await pills.count()).toBeGreaterThanOrEqual(6);
  for (const label of ["Hadir", "Terlambat", "Izin", "Sakit", "Dispensasi", "Alpa"]) {
    const pill = page.locator("span.rounded-pill", { hasText: new RegExp(`^${label}$`) }).first();
    await expect(pill.locator("svg")).toHaveCount(1);
  }
});
