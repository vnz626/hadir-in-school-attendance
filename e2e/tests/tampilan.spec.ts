import { test, type Page } from "@playwright/test";
import path from "node:path";
import { ADMIN_EMAIL, ADMIN_PASSWORD, login } from "../fixtures";

// Tangkapan layar untuk ditinjau pemilik proyek (AGENTS.md §8, §9): 360, 1440, dan 1920 px.
// Bukan penjaga regresi visual; hasilnya di e2e/screenshots/ (tidak masuk Git).

const WIDTHS = [
  { w: 360, h: 780 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
];
const OUT = path.resolve(__dirname, "../screenshots");

async function shoot(page: Page, name: string) {
  for (const { w, h } of WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `${name}-${w}.png`), fullPage: false });
  }
}

test("tangkapan layar halaman publik", async ({ page }) => {
  await page.goto("/masuk");
  await shoot(page, "masuk");
  await page.goto("/lupa-kata-sandi");
  await shoot(page, "lupa-kata-sandi");
  await page.goto("/dev/komponen");
  await page.waitForLoadState("networkidle");
  await shoot(page, "katalog-komponen");
});

test("tangkapan layar admin", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.waitForURL(/\/admin$/);
  await shoot(page, "admin-ringkasan");

  for (const [name, route] of [
    ["admin-data-master", "/admin/master"],
    ["admin-siswa", "/admin/master/students"],
    ["admin-kelas", "/admin/master/classes"],
    ["admin-jadwal", "/admin/master/schedules"],
    ["admin-impor", "/admin/impor"],
    ["admin-pengaturan", "/admin/pengaturan"],
  ] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    await page.locator("main h1").waitFor();
    await shoot(page, name);
  }

  // Formulir panel samping.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/master/students");
  await page.getByRole("button", { name: "Tambah siswa" }).first().click();
  await page.getByRole("dialog").waitFor();
  await shoot(page, "admin-form-siswa");
});
