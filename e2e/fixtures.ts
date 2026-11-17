import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@hadirin.test";
// Kata sandi admin dari .env: dipakai tes, tidak pernah dicetak.
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";

export async function login(page: Page, identifier: string, password: string): Promise<void> {
  await page.goto("/masuk");
  await page.getByLabel("Email atau NIS").fill(identifier);
  await page.getByLabel("Kata sandi", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
}

/** Masuk lalu ganti kata sandi awal (wajib), dan kembalikan kata sandi baru. */
export async function loginAndChangePassword(
  page: Page,
  identifier: string,
  temporary: string,
  next: string,
): Promise<void> {
  await login(page, identifier, temporary);
  await expect(page).toHaveURL(/\/ganti-kata-sandi/);
  await page.getByLabel("Kata sandi saat ini").fill(temporary);
  await page.getByLabel("Kata sandi baru").fill(next);
  await page.getByRole("button", { name: "Simpan kata sandi" }).click();
}

/** Ambil teks kata sandi sementara dari dialog, lalu tutup. */
export async function takeTemporaryPassword(page: Page): Promise<string> {
  const box = page.getByTestId("temporary-password");
  await expect(box).toBeVisible();
  const value = (await box.textContent())?.trim() ?? "";
  expect(value).toHaveLength(10);
  await page.getByRole("button", { name: "Selesai" }).click();
  return value;
}

/** Pilih nilai pada pemilih rujukan (combobox) berdasarkan label dan teks opsi. */
export async function pickRef(
  page: Page,
  label: string,
  search: string,
  optionText: RegExp | string,
): Promise<void> {
  const box = page.getByRole("combobox", { name: label });
  await box.click();
  await box.fill(search);
  await page.getByRole("option", { name: optionText }).first().click();
}
