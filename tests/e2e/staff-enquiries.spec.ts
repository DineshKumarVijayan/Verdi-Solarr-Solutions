import { expect, test } from "@playwright/test";

// Staff log enquiries they handle by phone / WhatsApp / visit; owner & admins see counts per staff member.

test("staff log a phone enquiry with products; it shows in Enquiries and in the performance report", async ({ page }) => {
  const name = `Call Test ${Date.now().toString().slice(-6)}`;
  await page.goto("/admin/enquiries");
  await page.getByTestId("log-enquiry-open").click();
  const form = page.getByTestId("log-enquiry-form");
  await form.getByRole("button", { name: "Phone call" }).click();
  await form.locator("#le-name").fill(name);
  await form.locator("#le-mobile").fill("9876501234");
  await form.locator("#le-location").fill("Chennai");
  await form.locator("#le-need").fill("Needs a 5 kW rooftop system");
  await form.getByTestId("le-product-search").fill("inverter");
  await form.getByTestId("le-product-hit").first().click();
  await form.getByRole("button", { name: "Increase quantity" }).click();
  await expect(form.getByTestId("le-items").getByRole("textbox")).toHaveValue("2");
  await form.getByRole("button", { name: "Quoted" }).click();
  await page.getByTestId("le-save").click();
  const row = page.getByTestId("admin-enquiry").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("enquiry-source")).toContainText("Phone");

  // filter: logged by staff only
  await page.getByRole("button", { name: "Logged by staff" }).click();
  await expect(page).toHaveURL(/source=staff/);
  await expect(page.getByTestId("admin-enquiry").filter({ hasText: name })).toBeVisible();

  // performance report counts it for today
  await page.goto("/admin/performance");
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  const totals = page.getByTestId("performance-totals");
  await expect(totals).toContainText("Logged by staff");
  const logged = Number(await totals.locator("dd").first().textContent());
  expect(logged).toBeGreaterThanOrEqual(1);
  await page.getByRole("radio", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/period=month/);
  await expect(page.getByTestId("trend-chart")).toBeVisible();
});

test("logging validates the customer details and the stats need owner or admin", async ({ page, request, playwright }) => {
  const base = test.info().project.use.baseURL!;
  const bad = await page.request.post("/api/admin/enquiries", { headers: { Origin: base }, data: { source: "phone", name: "x", mobile: "12", location: "" } });
  expect(bad.status()).toBe(422);
  const noOrigin = await page.request.post("/api/admin/enquiries", { data: { source: "phone", name: "Test", mobile: "9876501234", location: "Chennai" } });
  expect([403, 400]).toContain(noOrigin.status());
  // signed out: no access to the report
  const anon = await playwright.request.newContext({ baseURL: base, storageState: { cookies: [], origins: [] } });
  expect((await anon.get("/api/admin/enquiries/stats")).status()).toBe(401);
  await anon.dispose();
  expect((await request.get("/api/admin/enquiries/stats?period=year")).ok()).toBeTruthy();
});
