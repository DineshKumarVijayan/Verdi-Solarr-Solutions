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
  await page.getByRole("button", { name: "Staff outreach" }).click();
  await expect(page).toHaveURL(/source=staff/);
  await expect(page.getByTestId("admin-enquiry").filter({ hasText: name })).toBeVisible();

  // performance report counts it for today
  await page.goto("/admin/performance");
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  const totals = page.getByTestId("performance-totals");
  await expect(totals).toContainText("Enquiries");
  const logged = Number(await totals.locator("dd").first().textContent());
  expect(logged).toBeGreaterThanOrEqual(1);
  await page.getByRole("radio", { name: "Monthly" }).click();
  await expect(page).toHaveURL(/period=month/);
  await expect(page.getByTestId("trend-chart")).toBeVisible();
});

test("the form checks the details in the browser first: no request is sent for invalid input", async ({ page }) => {
  const posts: number[] = [];
  page.on("response", (r) => r.url().endsWith("/api/admin/enquiries") && r.request().method() === "POST" && posts.push(r.status()));
  await page.goto("/admin/enquiries");
  await page.getByTestId("log-enquiry-open").click();
  await expect(page.getByTestId("log-enquiry-form")).toContainText("How did you reach them?");
  await page.locator("#le-name").fill("A");
  await page.locator("#le-mobile").fill("123");
  await page.getByTestId("le-save").click();
  await expect(page.getByText("Enter the customer's name")).toBeVisible();
  await expect(page.getByText("Enter a valid mobile number")).toBeVisible();
  await expect(page.locator("#le-name")).toBeFocused();
  expect(posts).toEqual([]);
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

test("admin tables are paged with 5 / 10 / 20 / All", async ({ page }) => {
  await page.goto("/admin/prices");
  const rows = page.getByTestId("admin-price-row");
  await expect(rows.first()).toBeVisible();
  await page.getByTestId("pager").getByTestId("page-size-5").click();
  await expect(rows).toHaveCount(5);
  await page.getByTestId("pager").getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByTestId("pager-range")).toHaveText(/^6–10 of/);
  await page.getByTestId("pager").getByTestId("page-size-all").click();
  expect(await rows.count()).toBeGreaterThan(10);
  await page.getByTestId("pager").getByTestId("page-size-10").click();
});
