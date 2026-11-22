import { expect, test } from "@playwright/test";

// Stock status and offers: set by owner/admin, shown wherever products appear, filterable, on the
// home "On offer now" strip, and given to search engines with the listed price.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };

test.describe.configure({ mode: "serial" });

type P = { id: number; slug: string; name: string; price: { sellingPaise: number | null; mrpPaise: number | null }; stock?: string; offer?: { label: string | null } | null };
let a: P;
let b: P;

test.beforeAll(async ({ request }) => {
  const cat = (await (await request.get("/api/catalogue")).json()).products as P[];
  a = cat.find((p) => p.price.sellingPaise !== null && p.price.mrpPaise !== null && p.price.mrpPaise > p.price.sellingPaise) ?? cat.find((p) => p.price.sellingPaise !== null)!;
  b = cat.find((p) => p.id !== a.id && p.price.sellingPaise !== null)!;
});
test.afterAll(async ({ request }) => {
  for (const p of [a, b]) await request.put(`/api/admin/products/${p.id}/status`, { headers: H, data: { stock: "in_stock", onOffer: false, offerLabel: null } });
});

test("every product starts In stock; owner sets Limited + an offer and Out of stock; customers see it everywhere", async ({ request, page }) => {
  const before = (await (await request.get("/api/catalogue")).json()).products as P[];
  expect(before.every((p) => p.stock === "in_stock" || p.stock === "limited" || p.stock === "out_of_stock")).toBeTruthy();
  // validation and permissions
  expect((await request.put(`/api/admin/products/${a.id}/status`, { headers: H, data: { stock: "plenty", onOffer: false } })).status()).toBe(422);
  expect((await request.put(`/api/admin/products/${a.id}/status`, { headers: H, data: { stock: "limited", onOffer: true, offerLabel: "x".repeat(40) } })).status()).toBe(422);
  expect((await request.put(`/api/admin/products/${a.id}/status`, { headers: H, data: { stock: "limited", onOffer: true, offerLabel: "Festival offer" } })).ok()).toBeTruthy();
  expect((await request.put(`/api/admin/products/${b.id}/status`, { headers: H, data: { stock: "out_of_stock", onOffer: false } })).ok()).toBeTruthy();

  const live = (await (await request.get("/api/catalogue")).json()).products as P[];
  expect(live.find((p) => p.id === a.id)).toMatchObject({ stock: "limited", offer: { label: "Festival offer" } });
  expect(live.find((p) => p.id === b.id)).toMatchObject({ stock: "out_of_stock", offer: null });

  // product page: status beside the price; out of stock explains enquiries still work
  await page.goto(`/products/${a.slug}`);
  await expect(page.getByTestId("buy-status")).toContainText("Limited stock");
  await expect(page.getByTestId("buy-status").getByTestId("offer-tag")).toContainText("Festival offer");
  await page.goto(`/products/${b.slug}`);
  await expect(page.getByTestId("buy-status")).toContainText("Out of stock");
  await expect(page.getByText("Currently out of stock. Send an enquiry")).toBeVisible();

  // listing: filters for offers and in stock
  await page.goto("/products?offer=1");
  await expect(page.getByTestId("product-card").filter({ hasText: a.name })).toBeVisible();
  await expect(page.getByTestId("product-card").filter({ hasText: b.name })).toHaveCount(0);
  await page.goto("/products?stock=1");
  await expect(page.getByTestId("product-card").filter({ hasText: b.name })).toHaveCount(0);
  await page.goto("/products");
  const card = page.getByTestId("product-card").filter({ hasText: b.name }).first();
  await expect(card.getByTestId("stock-status")).toHaveText("Out of stock");

  // home: "On offer now" appears with the product
  await page.goto("/");
  const strip = page.getByTestId("offers-strip");
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toContainText(a.name);

  // search engines get the availability with the listed price
  const html = await (await request.get(`/products/${a.slug}`)).text();
  expect(html).toContain('"availability":"https://schema.org/LimitedAvailability"');

  // no offers -> the home strip is not shown at all
  await request.put(`/api/admin/products/${a.id}/status`, { headers: H, data: { stock: "in_stock", onOffer: false } });
  await page.goto("/");
  await expect(page.getByTestId("offers-strip")).toHaveCount(0);
});

test("owner changes stock from the products list and the product editor", async ({ page, request }) => {
  await page.goto(`/admin/products?q=${encodeURIComponent(a.name)}`);
  const row = page.getByTestId("admin-product-row").first();
  await row.getByTestId("quick-stock").selectOption("limited");
  await row.getByTestId("quick-offer").click();
  await expect(row.getByTestId("quick-offer")).toHaveAttribute("aria-pressed", "true");
  let live = (await (await request.get("/api/catalogue")).json()).products as P[];
  expect(live.find((p) => p.id === a.id)).toMatchObject({ stock: "limited", offer: { label: null } });

  await page.goto(`/admin/products/${a.id}`);
  const card = page.getByTestId("availability-card").filter({ visible: true });
  await card.getByTestId("stock-out_of_stock").click();
  await card.getByTestId("offer-label").fill("Clearance sale");
  await card.getByTestId("save-availability").click();
  await expect(page.getByText("Availability saved")).toBeVisible();
  live = (await (await request.get("/api/catalogue")).json()).products as P[];
  expect(live.find((p) => p.id === a.id)).toMatchObject({ stock: "out_of_stock", offer: { label: "Clearance sale" } });
});

test("admin searches accept long text (e.g. a full product name) without an error", async ({ request }) => {
  const long = "Mono PERC Bifacial Module (Transparent Backsheet) 540 Wp and more words";
  for (const path of ["/api/admin/products", "/api/admin/prices", "/api/admin/customers", "/api/admin/enquiries", "/api/admin/quotations"]) {
    expect((await request.get(`${path}?q=${encodeURIComponent(long)}`)).status(), path).toBe(200);
  }
});
