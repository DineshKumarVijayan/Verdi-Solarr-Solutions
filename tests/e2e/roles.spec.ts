import { expect, test } from "@playwright/test";

// What sales staff may see: no audit trail or staff names on the dashboard, no database size, and a
// clear "not for your role" screen (not a half-loaded page) on owner/admin pages opened by link.
// The owner sees the database size.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const MOBILE = `6${String(Date.now()).slice(-9)}`;

test.afterAll(async ({ request }) => {
  const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string }[];
  const u = users.find((x) => x.mobile?.endsWith(MOBILE));
  if (u) await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile: MOBILE, displayName: u.displayName, role: u.role, isActive: false } });
});

test("sales staff: no staff data on the dashboard, owner pages show a clear note; owner sees the database size", async ({ request, browser, page }) => {
  // owner view
  const own = await (await request.get("/api/admin/dashboard")).json();
  expect(typeof own.databaseBytes).toBe("number");
  await page.goto("/admin");
  await expect(page.getByTestId("db-size").filter({ visible: true })).toContainText("of 500 MB");

  // a sales staff member
  expect((await request.post("/api/admin/users", { headers: H, data: { email: "", mobile: MOBILE, password: "Temp@12345", displayName: "Role Check", role: "viewer", isActive: true } })).status()).toBe(201);
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const sp = await ctx.newPage();
  await sp.request.post("/api/admin/password", { headers: H, data: { login: MOBILE, currentPassword: "Temp@12345", newPassword: "Role#Check2026" } });
  expect((await sp.request.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: "Role#Check2026" } })).ok()).toBe(true);

  const d = await (await sp.request.get("/api/admin/dashboard")).json();
  expect(d.recentActivity).toEqual([]);
  expect(d.databaseBytes).toBeNull();
  expect(d.recentPrices.every((p: { updatedBy: string | null }) => p.updatedBy === null)).toBe(true);

  await sp.goto("/admin");
  await expect(sp.getByText("Recent activity")).toHaveCount(0);
  await expect(sp.getByTestId("db-size")).toHaveCount(0);

  for (const path of ["/admin/customers", "/admin/performance", "/admin/users"]) {
    await sp.goto(path);
    await expect(sp.getByTestId("no-access")).toBeVisible();
    await expect(sp.getByTestId("export-excel")).toHaveCount(0);
  }
  // staff bonus link: their own bonus instead, without asking for everyone's
  const asked: string[] = [];
  sp.on("request", (r) => asked.push(new URL(r.url()).pathname));
  await sp.goto("/admin/bonus");
  await expect(sp.getByTestId("my-bonus-totals")).toBeVisible();
  expect(asked).not.toContain("/api/admin/bonus");
  await ctx.close();
});
