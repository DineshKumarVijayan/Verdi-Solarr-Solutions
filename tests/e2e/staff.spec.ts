import { expect, test } from "@playwright/test";
import { runD1 } from "../../scripts/lib/passwords.mjs";

// Staff accounts: owner adds by mobile + temporary password (no email); staff must set their own
// password at first sign-in; change password from the sign-in page and the admin header; 30-min idle sign-out.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const MOBILE = `8${String(Date.now()).slice(-9)}`;
const TEMP = "Temp@12345";
const MINE = "MyOwn#Pass2026";
const MINE2 = "Second#Pass2026";

test.afterAll(async ({ request }) => {
  // deactivate the test staff member (admin users are never hard-deleted)
  const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string }[];
  const u = users.find((x) => x.mobile?.endsWith(MOBILE));
  if (u) await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile: MOBILE, displayName: u.displayName, role: u.role, isActive: false } });
});

test("owner adds staff by mobile only; staff must choose their own password, then can change it again", async ({ request, browser }) => {
  // owner creates the account: no email
  const created = await request.post("/api/admin/users", { headers: H, data: { email: "", mobile: MOBILE, password: TEMP, displayName: "E2E Staff", role: "viewer", isActive: true } });
  expect(created.status()).toBe(201);
  const row = (await created.json()).users.find((x: { mobile: string }) => x.mobile?.endsWith(MOBILE));
  expect(row.email).toBe("");
  expect(row.mustChangePassword).toBe(true);

  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  // the temporary password alone does not give a session
  expect((await page.request.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: TEMP } })).status()).toBe(403);

  // first sign-in -> forced change
  await page.goto("/admin");
  await page.getByLabel("Mobile number").fill(MOBILE);
  await page.getByLabel("Password", { exact: true }).fill(TEMP);
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-change-password-form")).toBeVisible();
  await expect(page.getByText("temporary password").first()).toBeVisible();
  await page.getByTestId("cp-new").fill(TEMP);
  await page.getByTestId("cp-confirm").fill(TEMP);
  await page.getByTestId("cp-submit").click();
  await expect(page.getByRole("alert")).toContainText("different");
  await page.getByTestId("cp-new").fill(MINE);
  await page.getByTestId("cp-confirm").fill(MINE);
  await page.getByTestId("cp-submit").click();
  await expect(page.getByTestId("admin-sign-out")).toBeVisible();
  await expect(page.getByText("E2E Staff ·")).toBeVisible();

  // old temporary password no longer works; owner sees the account as set up
  expect((await page.request.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: TEMP } })).status()).toBe(401);
  const after = (await (await request.get("/api/admin/users")).json()).users.find((x: { mobile: string }) => x.mobile?.endsWith(MOBILE));
  expect(after.mustChangePassword).toBe(false);

  // public pages show the staff name, with sign out instead of sign-in options
  await page.goto("/");
  await expect(page.getByTestId("signed-in-name")).toHaveText("E2E");

  // change again from the admin header
  await page.goto("/admin");
  await page.getByTestId("admin-change-password").click();
  await page.locator("#cp-current").fill(MINE);
  await page.getByTestId("cp-new").fill(MINE2);
  await page.getByTestId("cp-confirm").fill(MINE2);
  await page.getByTestId("cp-submit").click();
  await expect(page.getByText("Password changed")).toBeVisible();

  // change password from the sign-in page (signed out)
  await page.getByTestId("admin-sign-out").click();
  await page.getByTestId("admin-change-password-link").click();
  await page.locator("#cp-login").fill(MOBILE);
  await page.locator("#cp-current").fill(MINE2);
  await page.getByTestId("cp-new").fill(MINE);
  await page.getByTestId("cp-confirm").fill(MINE);
  await page.getByTestId("cp-submit").click();
  await expect(page.getByTestId("admin-sign-out")).toBeVisible();

  // the owner resets a forgotten password -> temporary again, sessions ended
  await request.put(`/api/admin/users/${row.id}`, { headers: H, data: { email: "", mobile: MOBILE, password: TEMP, displayName: "E2E Staff", role: "viewer", isActive: true } });
  expect((await page.request.get("/api/admin/me")).status()).toBe(401);
  expect((await page.request.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: TEMP } })).status()).toBe(403);
  await ctx.close();
});

test("signed-in users are signed out after 30 minutes without activity", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/account");
  await page.locator("input").first().fill("9000000002");
  await page.locator('input[type="password"]').first().fill("Customer@12345");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("signed-in-badge")).toBeVisible();

  // browser: coming back after 31 minutes shows signed out, with a notice, and ends the server session
  await page.evaluate(() => localStorage.setItem("verdi.lastActive", String(Date.now() - 31 * 60_000)));
  await page.goto("/");
  await expect(page.getByTestId("signed-out-notice")).toContainText("No activity for 30 minutes");
  await expect(page.getByTestId("signed-in-badge")).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get("/api/account/me")).json()).customer).toBeNull();

  // server: a session idle for 30+ minutes is rejected even if the browser never noticed
  const H2 = { Origin: BASE, "Content-Type": "application/json" };
  expect((await page.request.post("/api/account/login", { headers: H2, data: { login: "9000000002", password: "Customer@12345" } })).status()).toBe(200);
  expect((await (await page.request.get("/api/account/me")).json()).customer).not.toBeNull();
  await runD1("UPDATE CustomerSessions SET ExpiresAt = '2000-01-01T00:00:00.000Z' WHERE CustomerId = (SELECT CustomerId FROM Customers WHERE Mobile = '919000000002');", false, true);
  expect((await (await page.request.get("/api/account/me")).json()).customer).toBeNull();
  await ctx.close();
});
