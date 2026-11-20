import { expect, test } from "@playwright/test";

// Attack-style requests must be refused safely (no data, no stack traces, no side effects).
// Signed out: these are what an anonymous attacker could send.
test.use({ storageState: { cookies: [], origins: [] } });

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };

test("SQL-injection style sign-in attempts are rejected generically", async ({ request }) => {
  for (const [login, password] of [
    ["' OR 1=1 --", "x' OR '1'='1"],
    ["9000000002' --", "anything"],
    ["admin@x.com'; DROP TABLE Customers; --", "x"],
  ]) {
    const r = await request.post("/api/account/login", { headers: H, data: { login, password } });
    expect([401, 422, 429]).toContain(r.status());
    expect(await r.text()).not.toMatch(/SQLITE|syntax|stack|at \w+ \(/i);
  }
  for (const login of ["' OR 1=1 --", "9000000001' --"]) {
    const r = await request.post("/api/admin/login", { headers: H, data: { login, password: "x" } });
    expect([401, 422, 429]).toContain(r.status());
  }
  // the tables are still there
  expect((await request.get("/api/catalogue")).status()).toBe(200);
});

test("path traversal, forged links and oversized input are refused", async ({ request }) => {
  expect([400, 404]).toContain((await request.get("/api/media/..%2f..%2fwrangler.jsonc")).status());
  expect([400, 404]).toContain((await request.get("/api/media/quote/1/anything.pdf")).status()); // quotations only via their private link
  expect((await request.get("/api/q/' OR 1=1--")).status()).toBe(404);
  const big = await request.post("/api/enquiries", { headers: H, data: { customer: { name: "<script>alert(1)</script>".repeat(2000) }, items: [], pricesVerified: true } });
  expect([413, 422]).toContain(big.status());
});

test("admin API is closed to anonymous and cross-site requests", async ({ request }) => {
  expect((await request.get("/api/admin/customers")).status()).toBe(401);
  expect((await request.post("/api/admin/products", { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: {} })).status()).toBe(401);
  expect((await request.get("/api/admin/quotations/settings")).status()).toBe(401);
});

test("security.txt and legal pages are published", async ({ request, page }) => {
  expect((await request.get("/.well-known/security.txt")).status()).toBe(200);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy policy" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of use" })).toBeVisible();
  await expect(page.locator('footer:visible a[href="/privacy"]')).toBeVisible();
});
