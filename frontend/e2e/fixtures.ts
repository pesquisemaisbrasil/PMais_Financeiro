import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Os mesmos valores FICTÍCIOS de backend/scripts/seed_e2e.py.
export const PASSWORD = "E2e!Fictic1a";
export const TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow
export const RECOVERY_CODE = "E2E2-RECU-PERA-CAO2";

export const API_URL = `http://localhost:${process.env.E2E_BACKEND_PORT ?? 8011}`;

function decodeBase32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** O código de 6 dígitos que um app autenticador mostraria agora (RFC 6238). */
export function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hash = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = hash[hash.length - 1] & 0xf;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function submitPassword(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

export async function submitCode(page: Page, code: string) {
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await page.getByLabel(/Código/).fill(code);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** Login completo de uma conta que já tem o MFA cadastrado. */
export async function signIn(page: Page, email: string) {
  await submitPassword(page, email);
  await submitCode(page, totp(TOTP_SECRET));
  await expectHome(page);
}

export async function expectHome(page: Page) {
  await expect(page.getByRole("heading", { name: /^Olá, / })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
}

export async function refreshCookie(page: Page) {
  const cookies = await page.context().cookies(`${API_URL}/auth/token`);
  return cookies.find((cookie) => cookie.name === "refresh_token");
}
