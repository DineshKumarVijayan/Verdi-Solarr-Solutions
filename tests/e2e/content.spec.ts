import { expect, test, type APIRequestContext } from "@playwright/test";
import { formatPaise } from "../../shared/money";

// Admin content management + customer accounts, end to end against the local Worker + D1 + R2.
// Admin calls use the test owner session from global-setup.ts.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const RUN = Date.now().toString(36);
const SKU = `E2E-${RUN}`.toUpperCase();
const BRAND_SLUG = `e2e-brand-${RUN}`;
const CAT_SLUG = `e2e-cat-${RUN}`;
const MOBILE = `9${String(Date.now()).slice(-9)}`;

/** Admin write that waits out the local rate limiter instead of silently leaving test data behind. */
async function write(request: APIRequestContext, method: "delete" | "put", url: string, data?: unknown) {
  for (let i = 0; i < 4; i++) {
    const r = await request[method](url, { headers: H, data });
    if (r.status() !== 429) {
      if (!r.ok()) console.warn(`cleanup ${method.toUpperCase()} ${url} -> ${r.status()}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 20_000));
  }
}

async function cleanup(request: APIRequestContext) {
  const prods = await (await request.get(`/api/admin/products?q=E2E-`)).json();
  for (const p of prods.rows ?? []) await write(request, "delete", `/api/admin/products/${p.id}`);
  const brands = await (await request.get("/api/admin/brands")).json();
  for (const b of brands.brands ?? []) if (b.slug.startsWith("e2e-")) await write(request, "delete", `/api/admin/brands/${b.id}`);
  const cats = await (await request.get("/api/admin/categories")).json();
  for (const c of cats.categories ?? []) if (c.slug.startsWith("e2e-")) await write(request, "delete", `/api/admin/categories/${c.id}`);
  const photos = await (await request.get("/api/admin/field-photos")).json();
  for (const p of photos.photos ?? []) if (p.caption.startsWith("E2E") || p.tag.startsWith("E2E")) await write(request, "delete", `/api/admin/field-photos/${p.id}`);
  await write(request, "put", "/api/admin/settings", { settings: { announcement: "", instagramUrl: "" } });
}

test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ request }) => cleanup(request));
test.afterAll(async ({ request }) => {
  test.setTimeout(120_000);
  await cleanup(request);
});

test("admin adds a brand, category and product with specs, price, image and datasheet; it appears across the site", async ({ page, request }) => {
  // Brand + category through the UI
  await page.goto("/admin/catalogue");
  await page.getByTestId("new-brand").click();
  await page.getByLabel("Brand name").fill(`E2E Brand ${RUN}`);
  await page.getByLabel("Web slug").fill(BRAND_SLUG);
  await page.getByTestId("save-brand").click();
  await expect(page.getByText(`E2E Brand ${RUN}`)).toBeVisible();
  await page.getByTestId("new-category").click();
  await page.getByLabel("Category name").fill(`E2E Category ${RUN}`);
  await page.getByLabel("Web slug").fill(CAT_SLUG);
  await page.getByTestId("save-category").click();
  await expect(page.getByText(`E2E Category ${RUN}`)).toBeVisible();

  // Product through the UI
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill(`E2E Test Module ${RUN} 555 Wp`);
  await page.getByLabel("Brand *").selectOption({ label: `E2E Brand ${RUN}` });
  await page.getByLabel("Category *").selectOption({ label: `E2E Category ${RUN}` });
  await page.getByLabel("SKU (your product code)").fill(SKU);
  await page.getByLabel("Manufacturer model number").fill(`E2E-MODEL-${RUN}`);
  await page.getByLabel("Short description").fill("End-to-end test product");
  await page.getByTestId("add-spec").click();
  await page.getByLabel("Group, row 1").fill("Electrical");
  await page.getByLabel("Label, row 1").fill("Maximum power");
  await page.getByLabel("Value, row 1").fill("555");
  await page.getByLabel("Unit, row 1").fill("Wp");
  await page.getByLabel("Field key, row 1").fill("power_wp");
  await page.getByTestId("new-price").fill("14,250.50");
  await page.getByLabel("GST rate").selectOption("12");
  // Photos + datasheet picked on the Add page itself (uploaded now, attached on Create)
  const pdf = (await import("node:fs")).readdirSync("public/datasheets").find((f) => f.endsWith(".pdf"))!;
  await page.getByTestId("new-images").setInputFiles(["public/images/site/acdb-boxes.webp", "public/images/site/anchor-module-pallets.webp"]);
  await expect(page.getByTestId("pending-images").locator("li")).toHaveCount(2);
  await page.getByTestId("new-datasheet").setInputFiles(`public/datasheets/${pdf}`);
  await expect(page.getByTestId("pending-datasheet")).toContainText(pdf);
  await page.getByTestId("pending-images").getByRole("button", { name: "Make cover" }).click();
  await page.getByTestId("save-product").click();
  await expect(page).toHaveURL(/\/admin\/products\/\d+$/);
  await expect(page.getByText("Product created and published.")).toBeVisible();
  await expect(page.getByTestId("product-images").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("current-datasheet")).toBeVisible();

  // Adding more later from the edit page still works
  await page.getByTestId("upload-image").setInputFiles("public/images/site/acdb-boxes.webp");
  await expect(page.getByTestId("product-images").locator("li")).toHaveCount(3);

  // Public catalogue reflects everything (no admin fields leak)
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { sku: string }) => x.sku === SKU);
  expect(p).toBeTruthy();
  expect(p.price.sellingPaise).toBe(1425050);
  expect(p.specs[0]).toMatchObject({ k: "power_wp", v: "555", u: "Wp" });
  expect(p.images[0].url).toMatch(/^\/api\/media\/image\//);
  expect(p.datasheet).toMatch(/^\/api\/media\/datasheet\/.+\.pdf$/);
  expect(cat.brands.some((b: { slug: string }) => b.slug === BRAND_SLUG)).toBe(true);
  expect(JSON.stringify(cat)).not.toMatch(/updatedBy|UpdatedBy|@gmail/);
  const img = await request.get(p.images[0].url);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/webp");

  // Product page, listing filters, search and the category page all show it
  await page.goto(`/products/${p.slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E Test Module ${RUN}`);
  await expect(page.getByText(formatPaise(1425050)).first()).toBeVisible();
  await page.goto(`/category/${CAT_SLUG}`);
  await expect(page.getByTestId("product-card")).toHaveCount(1);
  await page.goto(`/products?q=${encodeURIComponent(`E2E-MODEL-${RUN}`)}`);
  await expect(page.getByTestId("product-card").first()).toContainText(`E2E Test Module ${RUN}`);
});

test("price and product edits from admin reflect on product, listing, compare and enquiry pages", async ({ page, request }) => {
  const list = await (await request.get(`/api/admin/products?q=${SKU}`)).json();
  const id = list.rows[0].id as number;
  const price = await (await request.get(`/api/admin/prices?q=${SKU}`)).json();
  const res = await request.put(`/api/admin/prices/${id}`, {
    headers: H,
    data: { sellingPricePaise: 1599900, mrpPaise: null, gstIncluded: true, gstRate: 12, priceUnit: "per piece", expectedVersion: price.rows[0].version, reason: "e2e reflect" },
  });
  expect(res.status()).toBe(200);
  // Rename through the product editor
  await page.goto(`/admin/products/${id}`);
  await page.getByLabel("Product name").fill(`E2E Renamed Module ${RUN}`);
  await page.getByTestId("save-product").click();
  await expect(page.getByText("Saved. Live on the website.")).toBeVisible();

  const slug = (await (await request.get(`/api/admin/products/${id}`)).json()).product.slug;
  const shown = formatPaise(1599900);
  await page.goto(`/products/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`E2E Renamed Module ${RUN}`);
  await expect(page.getByText(shown).first()).toBeVisible();
  await page.goto(`/category/${CAT_SLUG}`);
  await expect(page.getByTestId("product-card").first()).toContainText(shown);
  await page.getByTestId("product-card").first().getByTestId("add-to-enquiry").click();
  await page.goto("/enquiry");
  await expect(page.getByTestId("basket-total")).toHaveText(shown);
});

test("hiding a product removes it from the website; stale edits are rejected", async ({ request }) => {
  const id = (await (await request.get(`/api/admin/products?q=${SKU}`)).json()).rows[0].id as number;
  const d = (await (await request.get(`/api/admin/products/${id}`)).json()).product;
  const body = { sku: d.sku, slug: d.slug, name: d.name, brandId: d.brandId, categoryId: d.categoryId, specs: d.specs, highlights: [], isActive: false, isFeatured: false, expectedUpdatedAt: d.updatedAt };
  expect((await request.put(`/api/admin/products/${id}`, { headers: H, data: body })).status()).toBe(200);
  const stale = await request.put(`/api/admin/products/${id}`, { headers: H, data: { ...body, isActive: true } });
  expect(stale.status()).toBe(409);
  const cat = await (await request.get("/api/catalogue")).json();
  expect(cat.products.some((p: { sku: string }) => p.sku === SKU)).toBe(false);
  // Brand with products cannot be deleted
  const brand = (await (await request.get("/api/admin/brands")).json()).brands.find((b: { slug: string }) => b.slug === BRAND_SLUG);
  expect((await request.delete(`/api/admin/brands/${brand.id}`, { headers: { Origin: BASE } })).status()).toBe(409);
});

test("uploads are type-checked; writes need a same-origin request", async ({ request }) => {
  const png = await request.post("/api/admin/uploads?kind=datasheet", { headers: { Origin: BASE, "Content-Type": "application/pdf" }, data: Buffer.from("not a pdf at all") });
  expect(png.status()).toBe(415);
  const cross = await request.post("/api/admin/brands", { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { name: "x", slug: "xx" } });
  expect(cross.status()).toBe(403);
  const custCross = await request.post("/api/account/login", { headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, data: { login: "x", password: "y" } });
  expect(custCross.status()).toBe(403);
});

test("admin manages field photos and site settings; the public site follows", async ({ page }) => {
  await page.goto("/admin/field-photos");
  await expect(page.getByTestId("admin-field-photos").locator("li").first()).toBeVisible();
  const before = await page.getByTestId("admin-field-photos").locator("li").count();
  await page.getByLabel("Tag for new photos").fill(`E2E${RUN}`);
  await page.getByTestId("upload-field-photo").setInputFiles("public/images/site/metal-roof-rails.webp");
  await expect(page.getByTestId("admin-field-photos").locator("li")).toHaveCount(before + 1);
  const card = page.getByTestId("admin-field-photos").locator("li").last();
  await card.getByLabel("Caption").fill(`E2E rooftop ${RUN}`);
  await card.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/in-the-field");
  await expect(page.getByTestId("field-photo").filter({ hasText: `E2E rooftop ${RUN}` })).toHaveCount(1);

  await page.goto("/admin/settings");
  await page.getByLabel("Announcement bar").fill(`E2E announcement ${RUN}`);
  await page.getByLabel("Instagram").fill("https://www.instagram.com/example_e2e");
  await page.getByTestId("save-settings").click();
  await expect(page.getByText("Settings saved. Live on the website.")).toBeVisible();
  await page.goto("/contact");
  await expect(page.getByTestId("announcement")).toContainText(`E2E announcement ${RUN}`);
  await expect(page.getByTestId("social-links").getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://www.instagram.com/example_e2e");
  await page.goto("/admin/settings");
  await page.getByLabel("Instagram").fill("not a link");
  await page.getByTestId("save-settings").click();
  await expect(page.getByText("Links must start with https://").first()).toBeVisible();
});

test("customer registers, sends an enquiry, sees history, status and reward points; admin reset link works", async ({ page, request }) => {
  await page.goto("/account?mode=register");
  await page.getByLabel("Your name").fill("E2E Buyer");
  await page.getByLabel("Mobile number").fill(MOBILE);
  await page.getByLabel("Choose a password").fill("correct-horse-1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-name")).toContainText("Hello, E2E");
  await expect(page.getByTestId("signed-in-badge")).toBeVisible();

  // Enquiry while signed in: profile pre-fills, message carries a reference
  await page.goto("/products/anchor-n-type-topcon-dual-glass-bifacial-module-620-wp");
  await page.getByTestId("add-to-enquiry-main").click();
  await page.goto("/enquiry");
  await expect(page.locator("#f-name")).toHaveValue("E2E Buyer");
  await page.locator("#f-location").fill("Chennai");
  await page.getByTestId("check-prices").click();
  const preview = page.getByTestId("message-preview");
  await expect(preview).toBeVisible();
  // Previewing is not an enquiry: nothing is saved until the customer actually sends it.
  const count = async () => (await (await request.get("/api/admin/enquiries?q=E2E%20Buyer")).json()).rows.length;
  const before = await count();
  await page.waitForTimeout(500);
  expect(await count()).toBe(before);
  await page.context().route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  const [popup] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("open-whatsapp").click()]);
  await popup.waitForURL(/wa\.me/);
  const ref = decodeURIComponent(popup.url()).match(/Reference: (VS-\d{6}-[A-Z0-9]{5})/)![1];
  await popup.close();
  expect(await count()).toBe(before + 1);
  await page.keyboard.press("Escape");

  await page.goto("/account");
  await expect(page.getByTestId("enquiry-history")).toContainText(ref);
  await expect(page.getByTestId("enquiry-status").first()).toHaveText("Received");

  // Admin: mark won + award points on the enquiry
  const enq = (await (await request.get(`/api/admin/enquiries?q=${ref}`)).json()).rows[0];
  expect(enq.customerName).toBe("E2E Buyer");
  expect((await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: "e2e", salePaise: 100000 } })).status()).toBe(200);
  expect((await request.post(`/api/admin/customers/${enq.customerId}/points`, { headers: H, data: { points: 250, reason: "Order bonus", enquiryId: enq.id } })).status()).toBe(200);
  const over = await request.post(`/api/admin/customers/${enq.customerId}/points`, { headers: H, data: { points: -1000, reason: "too much" } });
  expect(over.status()).toBe(422);

  await page.reload();
  await expect(page.getByTestId("enquiry-status").first()).toHaveText("Order confirmed");
  await expect(page.getByTestId("points-balance")).toHaveText("250");

  // Sign out, wrong password is rejected generically
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByLabel("Mobile number or email").fill(MOBILE);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByTestId("account-submit").click();
  await expect(page.getByRole("alert")).toContainText("incorrect");

  // Admin issues a reset link; customer sets a new password and is signed in
  // (the shared test admin can hit the 120 writes/min limit during a full run: wait it out)
  let resetRes = await request.post(`/api/admin/customers/${enq.customerId}/reset-link`, { headers: H });
  for (let i = 0; i < 4 && resetRes.status() === 429; i++) {
    await new Promise((r) => setTimeout(r, 20_000));
    resetRes = await request.post(`/api/admin/customers/${enq.customerId}/reset-link`, { headers: H });
  }
  expect(resetRes.status()).toBe(200);
  const link = (await resetRes.json()).url as string;
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.getByLabel("New password").fill("brand-new-pass-2");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByTestId("account-name")).toBeVisible();
  // The link is single-use
  const reuse = await request.post("/api/account/reset", { headers: H, data: { token: new URL(link).searchParams.get("token"), newPassword: "another-pass-3" } });
  expect(reuse.status()).toBe(400);
});
